import prisma from '../../../config/database';
import { Decimal } from '@prisma/client/runtime/library';

export type StockBalanceRow = {
  id: string;
  productId: string;
  locationId: string;
  onHandQty: Decimal;
  reservedQty: Decimal;
  updatedAt: Date;
  product: { id: string; sku: string; name: string; uom: { code: string } };
  location: { id: string; code: string; name: string };
};

const RELATIONS = {
  product:  { select: { id: true, sku: true, name: true, uom: { select: { code: true } } } },
  location: { select: { id: true, code: true, name: true } },
};

export class StockBalanceRepository {
  async findByProductAndLocation(
    productId: string,
    locationId: string,
  ): Promise<StockBalanceRow | null> {
    return prisma.stockBalance.findUnique({
      where: { productId_locationId: { productId, locationId } },
      include: RELATIONS,
    }) as Promise<StockBalanceRow | null>;
  }

  async findByLocation(
    locationId: string,
    page: number,
    limit: number,
  ): Promise<{ data: StockBalanceRow[]; total: number }> {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      prisma.stockBalance.findMany({
        where: { locationId },
        skip,
        take: limit,
        include: RELATIONS,
        orderBy: { product: { sku: 'asc' } },
      }) as Promise<StockBalanceRow[]>,
      prisma.stockBalance.count({ where: { locationId } }),
    ]);
    return { data, total };
  }

  async findAll(
    page: number,
    limit: number,
  ): Promise<{ data: StockBalanceRow[]; total: number }> {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      prisma.stockBalance.findMany({
        skip,
        take: limit,
        include: RELATIONS,
        orderBy: [{ location: { code: 'asc' } }, { product: { sku: 'asc' } }],
      }) as Promise<StockBalanceRow[]>,
      prisma.stockBalance.count(),
    ]);
    return { data, total };
  }

  /**
   * Upsert: create balance at 0 if not exists, or return existing.
   * Must be called inside a transaction.
   */
  async upsertZero(
    tx: typeof prisma,
    productId: string,
    locationId: string,
  ): Promise<StockBalanceRow> {
    return (tx as any).stockBalance.upsert({
      where: { productId_locationId: { productId, locationId } },
      update: {},
      create: { productId, locationId, onHandQty: 0, reservedQty: 0 },
      include: RELATIONS,
    }) as Promise<StockBalanceRow>;
  }

  /**
   * Atomically increment onHandQty. Must be called inside a transaction.
   */
  async increment(
    tx: typeof prisma,
    productId: string,
    locationId: string,
    qty: number,
  ): Promise<StockBalanceRow> {
    return (tx as any).stockBalance.update({
      where: { productId_locationId: { productId, locationId } },
      data: { onHandQty: { increment: qty } },
      include: RELATIONS,
    }) as Promise<StockBalanceRow>;
  }

  /**
   * Atomically decrement onHandQty. Must be called inside a transaction.
   * Caller must validate available qty before calling this.
   */
  async decrement(
    tx: typeof prisma,
    productId: string,
    locationId: string,
    qty: number,
  ): Promise<StockBalanceRow> {
    return (tx as any).stockBalance.update({
      where: { productId_locationId: { productId, locationId } },
      data: { onHandQty: { decrement: qty } },
      include: RELATIONS,
    }) as Promise<StockBalanceRow>;
  }

  /**
   * Increment reservedQty. Must be called inside a transaction.
   */
  async reserve(
    tx: typeof prisma,
    productId: string,
    locationId: string,
    qty: number,
  ): Promise<StockBalanceRow> {
    return (tx as any).stockBalance.update({
      where: { productId_locationId: { productId, locationId } },
      data: { reservedQty: { increment: qty } },
      include: RELATIONS,
    }) as Promise<StockBalanceRow>;
  }

  /**
   * Decrement reservedQty. Must be called inside a transaction.
   */
  async release(
    tx: typeof prisma,
    productId: string,
    locationId: string,
    qty: number,
  ): Promise<StockBalanceRow> {
    return (tx as any).stockBalance.update({
      where: { productId_locationId: { productId, locationId } },
      data: { reservedQty: { decrement: qty } },
      include: RELATIONS,
    }) as Promise<StockBalanceRow>;
  }
}

export const stockBalanceRepository = new StockBalanceRepository();
