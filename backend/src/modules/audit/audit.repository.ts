import prisma from '../../config/database';

export interface AuditLogRow {
  id: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  timestamp: Date;
  beforeSnapshot: object | null;
  afterSnapshot: object | null;
  warnings: object | null;
  user: {
    id: string;
    email: string | null;
    phone: string | null;
  };
}

export interface AuditLogFilters {
  dateStart?: Date;
  dateEnd?: Date;
  userId?: string;
  entityType?: string;
  action?: string;
  /** Deprecated: use sourceLocationId instead */
  locationId?: string;
  sourceLocationId?: string;
  destinationLocationId?: string;
  page: number;
  limit: number;
}

export class AuditRepository {
  async findAll(filters: AuditLogFilters): Promise<{ data: AuditLogRow[]; total: number }> {
    const where: any = {};

    if (filters.dateStart || filters.dateEnd) {
      where.timestamp = {};
      if (filters.dateStart) where.timestamp.gte = filters.dateStart;
      if (filters.dateEnd)   where.timestamp.lte = filters.dateEnd;
    }

    if (filters.userId)     where.userId     = filters.userId;
    if (filters.entityType) where.entityType = filters.entityType;
    if (filters.action)     where.action     = filters.action;

    // Location-based filtering via subquery on related entity tables.
    // sourceLocationId maps to: transfer source OR adjustment item location.
    // destinationLocationId maps to: transfer destination only.
    // Backward-compat: bare locationId treated as sourceLocationId.
    const effectiveSrc  = filters.sourceLocationId ?? filters.locationId;
    const effectiveDest = filters.destinationLocationId;

    if (effectiveSrc || effectiveDest) {
      const entityIds = new Set<string>();
      const et = filters.entityType; // may narrow which tables we query

      const includeTransfers   = !et || et === 'STOCK_TRANSFER_REQUEST'  || et === 'STOCK_TRANSFER';
      const includeAdjustments = !et || et === 'STOCK_ADJUSTMENT_REQUEST' || et === 'STOCK_ADJUSTMENT';

      // --- Stock Transfer subquery ---
      if (includeTransfers) {
        const transferWhere: any = {};
        if (effectiveSrc)  transferWhere.sourceLocationId      = effectiveSrc;
        if (effectiveDest) transferWhere.destinationLocationId = effectiveDest;

        const transfers = await prisma.stockTransferRequest.findMany({
          where:  transferWhere,
          select: { id: true },
        });
        transfers.forEach((t) => entityIds.add(t.id));
      }

      // --- Stock Adjustment subquery (source location only; adjustments have no destination) ---
      if (includeAdjustments && effectiveSrc && !effectiveDest) {
        const items = await prisma.stockAdjustmentItem.findMany({
          where:    { locationId: effectiveSrc },
          select:   { requestId: true },
          distinct: ['requestId'],
        });
        items.forEach((i) => entityIds.add(i.requestId));
      }

      // If nothing matched, force empty result set.
      where.entityId = entityIds.size > 0
        ? { in: [...entityIds] }
        : { in: ['__no_match__'] };
    }

    const skip = (filters.page - 1) * filters.limit;

    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip,
        take: filters.limit,
        include: {
          user: {
            select: { id: true, email: true, phone: true },
          },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return { data: data as unknown as AuditLogRow[], total };
  }
}

export const auditRepository = new AuditRepository();
