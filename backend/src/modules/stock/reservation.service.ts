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
  // Computes available stock from the StockReservation table (authoritative).
  // Optional tx: use inside an existing transaction.
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

    const reservedQty  = Number(aggregate._sum.qty ?? 0);
    const availableQty = Math.max(0, onHandQty - reservedQty);

    return { onHandQty, reservedQty, availableQty };
  }

  // ---------------------------------------------------------------------------
  // reserveStock
  // Outer wrapper: opens a new transaction and calls reserveStockWithinTx.
  // Use when no enclosing transaction exists.
  // ---------------------------------------------------------------------------
  async reserveStock(params: {
    sourceType: ReservationSourceType;
    sourceId: string;
    items: ReserveStockItem[];
  }): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await this.reserveStockWithinTx(tx, params);
    });
  }

  // ---------------------------------------------------------------------------
  // reserveStockWithinTx
  // Inner core: runs inside caller-provided transaction.
  // Locks each StockBalance row (SELECT FOR UPDATE), validates available qty,
  // creates StockReservation records, and increments the cached reservedQty.
  // All-or-nothing: if any item fails, the whole transaction rolls back.
  // ---------------------------------------------------------------------------
  async reserveStockWithinTx(
    tx: any,
    params: {
      sourceType: ReservationSourceType;
      sourceId: string;
      items: ReserveStockItem[];
    },
  ): Promise<void> {
    const { sourceType, sourceId, items } = params;

    for (const item of items) {
      const { productId, locationId, qty, sourceItemId } = item;

      await stockBalanceRepository.upsertZero(tx, productId, locationId);

      // Row-level lock — prevents concurrent transactions from both passing
      // the availability check simultaneously.
      const locked     = await this.lockBalanceRow(tx, productId, locationId);
      const onHandQty  = Number(locked.onHandQty);

      // Compute reservedQty from StockReservation table within the same
      // transaction so the read is consistent with the row lock.
      const aggregate  = await tx.stockReservation.aggregate({
        where: { productId, locationId, status: ReservationStatus.ACTIVE },
        _sum:  { qty: true },
      });
      const reservedQty  = Number(aggregate._sum.qty ?? 0);
      const availableQty = onHandQty - reservedQty;

      if (qty > availableQty) {
        console.warn(
          `[ReservationService] Insufficient stock — productId=${productId} ` +
          `locationId=${locationId} available=${availableQty} requested=${qty} ` +
          `sourceType=${sourceType} sourceId=${sourceId}`,
        );
        throw new ValidationError(
          `Insufficient available stock for product ${productId} at location ${locationId}. ` +
          `Available: ${availableQty}, requested: ${qty}`,
        );
      }

      await tx.stockReservation.create({
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

      // Keep StockBalance.reservedQty in sync as a display cache.
      await stockBalanceRepository.reserve(tx, productId, locationId, qty);

      console.info(
        `[ReservationService] Reservation created — productId=${productId} ` +
        `locationId=${locationId} qty=${qty} sourceType=${sourceType} sourceId=${sourceId}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // releaseReservation
  // Outer wrapper: opens a new transaction and calls releaseReservationWithinTx.
  // ---------------------------------------------------------------------------
  async releaseReservation(params: {
    sourceType: ReservationSourceType;
    sourceId: string;
  }): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await this.releaseReservationWithinTx(tx, params);
    });
  }

  // ---------------------------------------------------------------------------
  // releaseReservationWithinTx
  // Inner core: runs inside caller-provided transaction.
  // Marks ACTIVE reservations as RELEASED and decrements cached reservedQty.
  // ---------------------------------------------------------------------------
  async releaseReservationWithinTx(
    tx: any,
    params: {
      sourceType: ReservationSourceType;
      sourceId: string;
    },
  ): Promise<void> {
    const { sourceType, sourceId } = params;

    const reservations = await tx.stockReservation.findMany({
      where: { sourceType, sourceId, status: ReservationStatus.ACTIVE },
    });

    if (reservations.length === 0) return;

    for (const reservation of reservations) {
      await tx.stockReservation.update({
        where: { id: reservation.id },
        data:  { status: ReservationStatus.RELEASED },
      });

      await stockBalanceRepository.release(
        tx,
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
  }

  // ---------------------------------------------------------------------------
  // consumeTransferReservation
  // Outer wrapper: opens a new transaction and calls consumeTransferReservationWithinTx.
  // ---------------------------------------------------------------------------
  async consumeTransferReservation(params: {
    sourceId: string;
    sourceLocationId: string;
    destinationLocationId: string;
  }): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await this.consumeTransferReservationWithinTx(tx, params);
    });
  }

  // ---------------------------------------------------------------------------
  // consumeTransferReservationWithinTx
  // Inner core: runs inside caller-provided transaction.
  // Marks each ACTIVE reservation as CONSUMED, decrements source onHandQty
  // AND reservedQty, increments destination onHandQty, and writes ledger entries.
  // Throws if no ACTIVE reservations exist (prevents silent finalization).
  // ---------------------------------------------------------------------------
  async consumeTransferReservationWithinTx(
    tx: any,
    params: {
      sourceId: string;
      sourceLocationId: string;
      destinationLocationId: string;
    },
  ): Promise<void> {
    const { sourceId, sourceLocationId, destinationLocationId } = params;

    const reservations = await tx.stockReservation.findMany({
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

      if (resLocationId !== sourceLocationId) {
        throw new ValidationError(
          `Reservation location mismatch for product ${productId}. ` +
          `Expected ${sourceLocationId}, found ${resLocationId}`,
        );
      }

      await stockBalanceRepository.upsertZero(tx, productId, sourceLocationId);
      const lockedSource = await this.lockBalanceRow(tx, productId, sourceLocationId);
      const sourceOnHand = Number(lockedSource.onHandQty);

      if (sourceOnHand < qty) {
        throw new ValidationError(
          `Insufficient on-hand stock at source for product ${productId}. ` +
          `On hand: ${sourceOnHand}, required: ${qty}`,
        );
      }

      await tx.stockReservation.update({
        where: { id: reservation.id },
        data:  { status: ReservationStatus.CONSUMED },
      });

      // Deduct from source: both onHandQty and reservedQty (releasing the reservation
      // in the balance cache as well).
      const sourceUpdated = await tx.stockBalance.update({
        where: { productId_locationId: { productId, locationId: sourceLocationId } },
        data:  {
          onHandQty:   { decrement: qty },
          reservedQty: { decrement: qty },
        },
      });

      await stockLedgerRepository.create(tx, {
        productId,
        locationId:   sourceLocationId,
        changeQty:    -qty,
        balanceAfter: Number(sourceUpdated.onHandQty),
        sourceType:   LedgerSourceType.TRANSFER_OUT,
        sourceId,
      });

      // Ensure destination balance exists and lock before incrementing.
      await stockBalanceRepository.upsertZero(tx, productId, destinationLocationId);
      await this.lockBalanceRow(tx, productId, destinationLocationId);

      const destUpdated = await stockBalanceRepository.increment(tx, productId, destinationLocationId, qty);

      await stockLedgerRepository.create(tx, {
        productId,
        locationId:   destinationLocationId,
        changeQty:    qty,
        balanceAfter: Number(destUpdated.onHandQty),
        sourceType:   LedgerSourceType.TRANSFER_IN,
        sourceId,
      });

      console.info(
        `[ReservationService] Reservation consumed — id=${reservation.id} ` +
        `productId=${productId} qty=${qty} src=${sourceLocationId} dst=${destinationLocationId}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Acquire a row-level lock on a StockBalance row (SELECT … FOR UPDATE).
   * Prevents concurrent transactions from reading stale available-qty values.
   * Must be called inside a transaction.
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
