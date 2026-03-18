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
  locationId?: string;
  page: number;
  limit: number;
}

export class AuditRepository {
  async findAll(filters: AuditLogFilters): Promise<{ data: AuditLogRow[]; total: number }> {
    const where: any = {};

    if (filters.dateStart || filters.dateEnd) {
      where.timestamp = {};
      if (filters.dateStart) where.timestamp.gte = filters.dateStart;
      if (filters.dateEnd) where.timestamp.lte = filters.dateEnd;
    }

    if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.entityType) {
      where.entityType = filters.entityType;
    }

    if (filters.action) {
      where.action = filters.action;
    }

    // locationId filter: match logs where entityId relates to a transfer/adjustment
    // touching that location — approximate by filtering via entityType + a subquery
    // For simplicity, we filter by entityId matching transfer/adjustment requests
    // that involve the locationId. This is handled at the service layer.

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
