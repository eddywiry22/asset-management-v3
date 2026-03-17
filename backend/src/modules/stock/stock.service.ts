import prisma from '../../config/database';
import { LedgerSourceType } from '@prisma/client';
import { stockBalanceRepository, StockBalanceRow } from './repositories/stockBalance.repository';
import { stockLedgerRepository, StockLedgerRow } from './repositories/stockLedger.repository';
import { ValidationError, ForbiddenError } from '../../utils/errors';

export type StockOverviewItem = {
  productId: string;
  productSku: string;
  productName: string;
  uomCode: string;
  locationId: string;
  locationCode: string;
  locationName: string;
  onHandQty: number;
  reservedQty: number;
  availableQty: number;
  startingQty: number;
  inboundQty: number;
  outboundQty: number;
  finalQty: number;
  pendingInbound: number;
  pendingOutbound: number;
};

export type StockQueryParams = {
  locationId?: string;
  page: number;
  limit: number;
  startDate?: Date;
  endDate?: Date;
};

export type LedgerQueryParams = {
  productId?: string;
  locationId?: string;
  startDate?: Date;
  endDate?: Date;
  page: number;
  limit: number;
};

export class StockService {
  /**
   * Get stock overview (balances + period computations) respecting location visibility.
   * - Admins see all locations
   * - Non-admins see only their assigned locations
   */
  async getStockOverview(
    params: StockQueryParams,
    userId: string,
    isAdmin: boolean,
  ): Promise<{ data: StockOverviewItem[]; total: number }> {
    const { locationId, page, limit, startDate, endDate } = params;

    // Determine visible locations
    const visibleLocationIds = await this.getVisibleLocationIds(userId, isAdmin, locationId);

    if (visibleLocationIds.length === 0) {
      return { data: [], total: 0 };
    }

    // Fetch balances for visible locations
    const skip = (page - 1) * limit;
    const whereClause: Record<string, unknown> = {
      locationId: { in: visibleLocationIds },
    };

    const [balances, total] = await Promise.all([
      prisma.stockBalance.findMany({
        where: whereClause,
        skip,
        take: limit,
        include: {
          product:  { select: { id: true, sku: true, name: true, uom: { select: { code: true } } } },
          location: { select: { id: true, code: true, name: true } },
        },
        orderBy: [{ location: { code: 'asc' } }, { product: { sku: 'asc' } }],
      }),
      prisma.stockBalance.count({ where: whereClause }),
    ]);

    // For each balance, compute period-based metrics
    const overviewItems: StockOverviewItem[] = await Promise.all(
      balances.map(async (b: any) => {
        const onHand     = Number(b.onHandQty);
        const reserved   = Number(b.reservedQty);
        const available  = Math.max(0, onHand - reserved);

        // Compute period sums from ledger
        let startingQty  = 0;
        let inboundQty   = 0;
        let outboundQty  = 0;

        if (startDate || endDate) {
          const sums = await stockLedgerRepository.sumBySourceType({
            locationId: b.locationId,
            productId:  b.productId,
            startDate,
            endDate,
          });

          for (const s of sums) {
            if (s.sourceType === LedgerSourceType.ADJUSTMENT || s.sourceType === LedgerSourceType.MOVEMENT_IN || s.sourceType === LedgerSourceType.SEED) {
              if (s.total > 0) inboundQty  += s.total;
              else             outboundQty -= s.total;
            } else if (s.sourceType === LedgerSourceType.MOVEMENT_OUT) {
              outboundQty += Math.abs(s.total);
            }
          }

          if (startDate) {
            startingQty = await stockLedgerRepository.getBalanceBeforeDate(
              b.productId,
              b.locationId,
              startDate,
            );
          }
        } else {
          // No period filter — return current state
          startingQty = onHand;
          inboundQty  = 0;
          outboundQty = 0;
        }

        const finalQty = startDate
          ? startingQty + inboundQty - outboundQty
          : onHand;

        return {
          productId:      b.productId,
          productSku:     b.product.sku,
          productName:    b.product.name,
          uomCode:        b.product.uom.code,
          locationId:     b.locationId,
          locationCode:   b.location.code,
          locationName:   b.location.name,
          onHandQty:      onHand,
          reservedQty:    reserved,
          availableQty:   available,
          startingQty,
          inboundQty,
          outboundQty,
          finalQty,
          pendingInbound:  0, // populated by adjustment/movement services in later stages
          pendingOutbound: reserved,
        };
      }),
    );

    return { data: overviewItems, total };
  }

  /**
   * Get paginated stock ledger entries respecting location visibility.
   */
  async getLedger(
    params: LedgerQueryParams,
    userId: string,
    isAdmin: boolean,
  ): Promise<{ data: StockLedgerRow[]; total: number }> {
    const { productId, locationId, startDate, endDate, page, limit } = params;

    // Determine visible locations
    const visibleLocationIds = await this.getVisibleLocationIds(userId, isAdmin, locationId);

    if (visibleLocationIds.length === 0) {
      return { data: [], total: 0 };
    }

    // If a specific locationId was requested but it's not visible, throw forbidden
    if (locationId && !visibleLocationIds.includes(locationId)) {
      throw new ForbiddenError('You do not have access to this location');
    }

    // Always scope results to visible locations.
    // Pass a single locationId when one was explicitly requested,
    // otherwise pass the full visibleLocationIds array so the repository
    // adds a WHERE locationId IN (...) clause — preventing data leakage
    // for non-admin users who have roles in multiple locations.
    return stockLedgerRepository.findMany({
      productId,
      locationId,
      visibleLocationIds: locationId ? undefined : visibleLocationIds,
      startDate,
      endDate,
      page,
      limit,
    });
  }

  /**
   * Apply a stock adjustment (called by adjustment finalizer — Stage 5).
   * Wrapped in a DB transaction. Records ledger entry.
   */
  async applyAdjustment(params: {
    productId: string;
    locationId: string;
    qtyChange: number;
    sourceId: string;
  }): Promise<void> {
    const { productId, locationId, qtyChange, sourceId } = params;

    await prisma.$transaction(async (tx) => {
      // Ensure balance row exists before acquiring lock
      await stockBalanceRepository.upsertZero(tx as any, productId, locationId);

      // Acquire row-level lock (SELECT FOR UPDATE) to prevent concurrent mutations
      const locked = await this.lockBalanceRow(tx as any, productId, locationId);
      const currentOnHand = Number(locked.onHandQty);
      const reserved      = Number(locked.reservedQty);

      if (qtyChange < 0) {
        const available = currentOnHand - reserved;
        if (available + qtyChange < 0) {
          throw new ValidationError(
            `Insufficient available stock. Available: ${available}, requested change: ${qtyChange}`,
          );
        }
      }

      let updated: any;
      if (qtyChange >= 0) {
        updated = await stockBalanceRepository.increment(tx as any, productId, locationId, qtyChange);
      } else {
        updated = await stockBalanceRepository.decrement(tx as any, productId, locationId, Math.abs(qtyChange));
      }

      await stockLedgerRepository.create(tx as any, {
        productId,
        locationId,
        changeQty:    qtyChange,
        balanceAfter: Number(updated.onHandQty),
        sourceType:   LedgerSourceType.ADJUSTMENT,
        sourceId,
      });
    });
  }

  /**
   * Apply a stock movement OUT (source location). Called by movement finalizer — Stage 6.
   */
  async applyMovementOut(params: {
    productId: string;
    locationId: string;
    qty: number;
    sourceId: string;
  }): Promise<void> {
    const { productId, locationId, qty, sourceId } = params;

    await prisma.$transaction(async (tx) => {
      await stockBalanceRepository.upsertZero(tx as any, productId, locationId);

      const locked    = await this.lockBalanceRow(tx as any, productId, locationId);
      const available = Number(locked.onHandQty) - Number(locked.reservedQty);

      if (available < qty) {
        throw new ValidationError(
          `Insufficient available stock. Available: ${available}, required: ${qty}`,
        );
      }

      const updated = await stockBalanceRepository.decrement(tx as any, productId, locationId, qty);

      await stockLedgerRepository.create(tx as any, {
        productId,
        locationId,
        changeQty:    -qty,
        balanceAfter: Number(updated.onHandQty),
        sourceType:   LedgerSourceType.MOVEMENT_OUT,
        sourceId,
      });
    });
  }

  /**
   * Apply a stock movement IN (destination location). Called by movement finalizer — Stage 6.
   */
  async applyMovementIn(params: {
    productId: string;
    locationId: string;
    qty: number;
    sourceId: string;
  }): Promise<void> {
    const { productId, locationId, qty, sourceId } = params;

    await prisma.$transaction(async (tx) => {
      await stockBalanceRepository.upsertZero(tx as any, productId, locationId);

      // Lock the row before incrementing to maintain consistent balanceAfter
      await this.lockBalanceRow(tx as any, productId, locationId);

      const updated = await stockBalanceRepository.increment(tx as any, productId, locationId, qty);

      await stockLedgerRepository.create(tx as any, {
        productId,
        locationId,
        changeQty:    qty,
        balanceAfter: Number(updated.onHandQty),
        sourceType:   LedgerSourceType.MOVEMENT_IN,
        sourceId,
      });
    });
  }

  /**
   * Reserve stock (increment reservedQty). Called when a movement is submitted — Stage 6.
   */
  async reserveStock(params: {
    productId: string;
    locationId: string;
    qty: number;
  }): Promise<void> {
    const { productId, locationId, qty } = params;

    await prisma.$transaction(async (tx) => {
      await stockBalanceRepository.upsertZero(tx as any, productId, locationId);

      const locked    = await this.lockBalanceRow(tx as any, productId, locationId);
      const available = Number(locked.onHandQty) - Number(locked.reservedQty);

      if (available < qty) {
        throw new ValidationError(
          `Insufficient available stock to reserve. Available: ${available}, requested: ${qty}`,
        );
      }

      await stockBalanceRepository.reserve(tx as any, productId, locationId, qty);
    });
  }

  /**
   * Release reservation (decrement reservedQty). Called on cancellation — Stage 6.
   */
  async releaseReservation(params: {
    productId: string;
    locationId: string;
    qty: number;
  }): Promise<void> {
    const { productId, locationId, qty } = params;

    await prisma.$transaction(async (tx) => {
      const current = await (tx as any).stockBalance.findUnique({
        where: { productId_locationId: { productId, locationId } },
      });

      if (!current) return; // nothing to release

      const currentReserved = Number(current.reservedQty);
      if (qty > currentReserved) {
        throw new ValidationError(
          `Cannot release ${qty} units; only ${currentReserved} are reserved`,
        );
      }

      await stockBalanceRepository.release(tx as any, productId, locationId, qty);
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Acquire a row-level lock on a StockBalance row using SELECT … FOR UPDATE.
   * This prevents concurrent transactions from reading stale available-qty
   * values and both passing the availability check, which would otherwise
   * allow negative inventory under REPEATABLE READ isolation.
   *
   * Must be called inside a prisma.$transaction callback.
   */
  private async lockBalanceRow(
    tx: any,
    productId: string,
    locationId: string,
  ): Promise<{ onHandQty: string; reservedQty: string }> {
    const rows: Array<{ onHandQty: string; reservedQty: string }> =
      await tx.$queryRaw`
        SELECT onHandQty, reservedQty
        FROM StockBalance
        WHERE productId = ${productId}
          AND locationId = ${locationId}
        FOR UPDATE
      `;
    if (!rows.length) {
      // Should not happen after upsertZero, but guard defensively
      return { onHandQty: '0', reservedQty: '0' };
    }
    return rows[0];
  }

  private async getVisibleLocationIds(
    userId: string,
    isAdmin: boolean,
    requestedLocationId?: string,
  ): Promise<string[]> {
    if (isAdmin) {
      if (requestedLocationId) return [requestedLocationId];

      const locations = await prisma.location.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      return locations.map((l) => l.id);
    }

    // Non-admin: only locations they have roles at
    const roles = await prisma.userLocationRole.findMany({
      where: { userId },
      select: { locationId: true },
    });
    const userLocationIds = roles.map((r) => r.locationId);

    if (requestedLocationId) {
      if (!userLocationIds.includes(requestedLocationId)) {
        throw new ForbiddenError('You do not have access to this location');
      }
      return [requestedLocationId];
    }

    return userLocationIds;
  }
}

export const stockService = new StockService();
