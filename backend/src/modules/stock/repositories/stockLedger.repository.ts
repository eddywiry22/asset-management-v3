import prisma from '../../../config/database';
import { LedgerSourceType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export type StockLedgerRow = {
  id: string;
  productId: string;
  locationId: string;
  changeQty: Decimal;
  balanceAfter: Decimal;
  sourceType: LedgerSourceType;
  sourceId: string;
  createdAt: Date;
  product: { id: string; sku: string; name: string };
  location: { id: string; code: string; name: string };
};

const RELATIONS = {
  product:  { select: { id: true, sku: true, name: true } },
  location: { select: { id: true, code: true, name: true } },
};

export class StockLedgerRepository {
  /**
   * Record an immutable ledger entry. Must be called inside a transaction.
   */
  async create(
    tx: typeof prisma,
    data: {
      productId: string;
      locationId: string;
      changeQty: number;
      balanceAfter: number;
      sourceType: LedgerSourceType;
      sourceId: string;
    },
  ): Promise<StockLedgerRow> {
    return (tx as any).stockLedger.create({
      data,
      include: RELATIONS,
    }) as Promise<StockLedgerRow>;
  }

  async findMany(params: {
    productId?: string;
    locationId?: string;
    startDate?: Date;
    endDate?: Date;
    page: number;
    limit: number;
  }): Promise<{ data: StockLedgerRow[]; total: number }> {
    const { productId, locationId, startDate, endDate, page, limit } = params;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (productId)  where.productId  = productId;
    if (locationId) where.locationId = locationId;
    if (startDate || endDate) {
      where.createdAt = {
        ...(startDate ? { gte: startDate } : {}),
        ...(endDate   ? { lte: endDate }   : {}),
      };
    }

    const [data, total] = await Promise.all([
      prisma.stockLedger.findMany({
        where,
        skip,
        take: limit,
        include: RELATIONS,
        orderBy: { createdAt: 'desc' },
      }) as Promise<StockLedgerRow[]>,
      prisma.stockLedger.count({ where }),
    ]);
    return { data, total };
  }

  /**
   * Sum ledger entries by sourceType within a date range per product/location.
   */
  async sumBySourceType(params: {
    locationId: string;
    productId?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<Array<{
    productId: string;
    locationId: string;
    sourceType: LedgerSourceType;
    total: number;
  }>> {
    const { locationId, productId, startDate, endDate } = params;

    const where: Record<string, unknown> = { locationId };
    if (productId) where.productId = productId;
    if (startDate || endDate) {
      where.createdAt = {
        ...(startDate ? { gte: startDate } : {}),
        ...(endDate   ? { lte: endDate }   : {}),
      };
    }

    const rows = await prisma.stockLedger.groupBy({
      by: ['productId', 'locationId', 'sourceType'],
      where,
      _sum: { changeQty: true },
    });

    return rows.map((r) => ({
      productId:  r.productId,
      locationId: r.locationId,
      sourceType: r.sourceType,
      total:      Number(r._sum.changeQty ?? 0),
    }));
  }

  /**
   * Get the balance just before the period start (for startingQty calculation).
   */
  async getBalanceBeforeDate(
    productId: string,
    locationId: string,
    beforeDate: Date,
  ): Promise<number> {
    const entry = await prisma.stockLedger.findFirst({
      where: {
        productId,
        locationId,
        createdAt: { lt: beforeDate },
      },
      orderBy: { createdAt: 'desc' },
      select: { balanceAfter: true },
    });
    return entry ? Number(entry.balanceAfter) : 0;
  }
}

export const stockLedgerRepository = new StockLedgerRepository();
