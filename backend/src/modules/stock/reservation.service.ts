import { ReservationSourceType, ReservationStatus, LedgerSourceType } from '@prisma/client';
import prisma from '../../config/database';
import { stockBalanceRepository } from './repositories/stockBalance.repository';
import { stockLedgerRepository } from './repositories/stockLedger.repository';
import { ValidationError } from '../../utils/errors';

export type AvailableStockResult = {
  onHandQty: number;
  reservedQty: number;
  availableQty: number;
};

export type ReserveStockItem = {
  productId: string;
  locationId: string;
  qty: number;
  sourceItemId: string;
};

export class ReservationService {
  // ---------------------------------------------------------------------------
  // getAvailableStock
  // Computes available stock by aggregating ACTIVE reservations from the
  // dedicated StockReservation table (authoritative source).
  // ---------------------------------------------------------------------------
  async getAvailableStock(
    productId: string,
    locationId: string,
    tx?: any,
  ): Promise<AvailableStockResult> {
    const client = tx ?? prisma;

    const balance = await client.stockBalance.findUnique({
      where: { productId_locationId: { productId, locationId } },
    });

    const onHandQty = balance ? Number(balance.onHandQty) : 0;

    const aggregate = await client.stockReservation.aggregate({
      where: { productId, locationId, status: ReservationStatus.ACTIVE },
      _sum: { qty: true },
    });

    const reservedQty = Number(aggregate._sum.qty ?? 0);
    const availableQty = Math.max(0, onHandQty - reservedQty);

    return { onHandQty, reservedQty, availableQty };
  }

  // ---------------------------------------------------------------------------
  // reserveStock
  // Creates StockReservation records for all items in a single atomic
  // transaction with SELECT FOR UPDATE row locking to prevent race conditions.
  // No partial reservation: if any item fails, the entire transaction rolls back.
  // ---------------------------------------------------------------------------
  async reserveStock(params: {
    sourceType: ReservationSourceType;
    sourceId: string;
    items: ReserveStockItem[];
  }): Promise<void> {
    const { sourceType, sourceId, items } = params;

    await prisma.$transaction(async (tx) => {
      for (const item of items) {
        const { productId, locationId, qty, sourceItemId } = item;

        // Ensure balance row exists before locking
        await stockBalanceRepository.upsertZero(tx as any, productId, locationId);

        // Acquire row-level lock (SELECT FOR UPDATE) — prevents concurrent
        // transactions from passing the availability check simultaneously
        const locked = await this.lockBalanceRow(tx, productId, locationId);
        const onHandQty = Number(locked.onHandQty);

        // Compute reservedQty from StockReservation table (authoritative)
        const aggregate = await (tx as any).stockReservation.aggregate({
          where: { productId, locationId, status: ReservationStatus.ACTIVE },
          _sum: { qty: true },
        });
        const reservedQty  = Number(aggregate._sum.qty ?? 0);
        const availableQty = onHandQty - reservedQty;

        if (qty > availableQty) {
          console.warn(
            `[ReservationService] Insufficient stock — productId=${productId} locationId=${locationId} ` +
            `available=${availableQty} requested=${qty} sourceType=${sourceType} sourceId=${sourceId}`,
          );
          throw new ValidationError(
            `Insufficient available stock for product ${productId} at location ${locationId}. ` +
            `Available: ${availableQty}, requested: ${qty}`,
          );
        }

        // Create the reservation record
        await (tx as any).stockReservation.create({
          data: {
            productId,
            locationId,
            qty,
            sourceType,
            sourceId,
            sourceItemId,
            status: ReservationStatus.ACTIVE,
          },
        });

        // Keep StockBalance.reservedQty in sync as a display cache
        await stockBalanceRepository.reserve(tx as any, productId, locationId, qty);

        console.info(
          `[ReservationService] Reservation created — productId=${productId} locationId=${locationId} ` +
          `qty=${qty} sourceType=${sourceType} sourceId=${sourceId} sourceItemId=${sourceItemId}`,
        );
      }
    });
  }

  // ---------------------------------------------------------------------------
  // releaseReservation
  // Marks all ACTIVE reservations for a given source as RELEASED.
  // Used when: request cancelled, rejected, or draft deleted after reservation.
  // ---------------------------------------------------------------------------
  async releaseReservation(params: {
    sourceType: ReservationSourceType;
    sourceId: string;
  }): Promise<void> {
    const { sourceType, sourceId } = params;

    await prisma.$transaction(async (tx) => {
      const reservations = await (tx as any).stockReservation.findMany({
        where: { sourceType, sourceId, status: ReservationStatus.ACTIVE },
      });

      if (reservations.length === 0) return;

      // Mark each reservation as RELEASED and decrement cached reservedQty
      for (const reservation of reservations) {
        await (tx as any).stockReservation.update({
          where: { id: reservation.id },
          data:  { status: ReservationStatus.RELEASED },
        });

        await stockBalanceRepository.release(
          tx as any,
          reservation.productId,
          reservation.locationId,
          Number(reservation.qty),
        );

        console.info(
          `[ReservationService] Reservation released — id=${reservation.id} ` +
          `productId=${reservation.productId} locationId=${reservation.locationId} ` +
          `qty=${Number(reservation.qty)} sourceType=${sourceType} sourceId=${sourceId}`,
        );
      }
    });
  }

  // ---------------------------------------------------------------------------
  // consumeReservation
  // Marks reservations as CONSUMED and applies the actual stock movement
  // in a single atomic transaction.
  // Used when a transfer is finalized.
  // ---------------------------------------------------------------------------
  async consumeTransferReservation(params: {
    sourceId: string;
    sourceLocationId: string;
    destinationLocationId: string;
  }): Promise<void> {
    const { sourceId, sourceLocationId, destinationLocationId } = params;

    await prisma.$transaction(async (tx) => {
      const reservations = await (tx as any).stockReservation.findMany({
        where: {
          sourceType: ReservationSourceType.TRANSFER,
          sourceId,
          status: ReservationStatus.ACTIVE,
        },
      });

      if (reservations.length === 0) {
        console.warn(
          `[ReservationService] No ACTIVE reservations found for transfer sourceId=${sourceId}`,
        );
        throw new ValidationError(
          `No active reservations found for transfer ${sourceId}. Cannot finalize.`,
        );
      }

      for (const reservation of reservations) {
        const { productId, locationId: resLocationId } = reservation;
        const qty = Number(reservation.qty);

        // Verify the reservation is at the expected source location
        if (resLocationId !== sourceLocationId) {
          throw new ValidationError(
            `Reservation location mismatch for product ${productId}. ` +
            `Expected ${sourceLocationId}, found ${resLocationId}`,
          );
        }

        // Lock source balance row
        await stockBalanceRepository.upsertZero(tx as any, productId, sourceLocationId);
        const lockedSource = await this.lockBalanceRow(tx, productId, sourceLocationId);
        const sourceOnHand = Number(lockedSource.onHandQty);

        if (sourceOnHand < qty) {
          throw new ValidationError(
            `Insufficient on-hand stock at source for product ${productId}. ` +
            `On hand: ${sourceOnHand}, required: ${qty}`,
          );
        }

        // Mark reservation as CONSUMED
        await (tx as any).stockReservation.update({
          where: { id: reservation.id },
          data:  { status: ReservationStatus.CONSUMED },
        });

        // Deduct from source: onHandQty AND reservedQty
        const sourceUpdated = await (tx as any).stockBalance.update({
          where: { productId_locationId: { productId, locationId: sourceLocationId } },
          data:  {
            onHandQty:   { decrement: qty },
            reservedQty: { decrement: qty },
          },
        });

        // Record TRANSFER_OUT ledger at source
        await stockLedgerRepository.create(tx as any, {
          productId,
          locationId:   sourceLocationId,
          changeQty:    -qty,
          balanceAfter: Number(sourceUpdated.onHandQty),
          sourceType:   LedgerSourceType.TRANSFER_OUT,
          sourceId,
        });

        // Ensure destination balance row exists and lock it
        await stockBalanceRepository.upsertZero(tx as any, productId, destinationLocationId);
        await this.lockBalanceRow(tx, productId, destinationLocationId);

        // Increase destination onHandQty
        const destUpdated = await stockBalanceRepository.increment(
          tx as any,
          productId,
          destinationLocationId,
          qty,
        );

        // Record TRANSFER_IN ledger at destination
        await stockLedgerRepository.create(tx as any, {
          productId,
          locationId:   destinationLocationId,
          changeQty:    qty,
          balanceAfter: Number(destUpdated.onHandQty),
          sourceType:   LedgerSourceType.TRANSFER_IN,
          sourceId,
        });

        console.info(
          `[ReservationService] Reservation consumed — id=${reservation.id} ` +
          `productId=${productId} qty=${qty} ` +
          `src=${sourceLocationId} dst=${destinationLocationId} sourceId=${sourceId}`,
        );
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Acquire a row-level lock on a StockBalance row using SELECT … FOR UPDATE.
   * Prevents concurrent transactions from reading stale available-qty values.
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
      return { onHandQty: '0', reservedQty: '0' };
    }
    return rows[0];
  }
}

export const reservationService = new ReservationService();
