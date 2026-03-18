import prisma from '../../config/database';
import { AdjustmentRequestStatus } from '@prisma/client';

export type AdjustmentItemRow = {
  id: string;
  requestId: string;
  productId: string;
  locationId: string;
  qtyChange: any;
  reason: string | null;
  createdAt: Date;
  product: { id: string; sku: string; name: string; uom: { code: string } };
  location: { id: string; code: string; name: string };
};

export type AdjustmentRequestRow = {
  id: string;
  requestNumber: string;
  status: AdjustmentRequestStatus;
  notes: string | null;
  createdById: string;
  approvedById: string | null;
  finalizedById: string | null;
  cancelledById: string | null;
  rejectedById: string | null;
  approvedAt: Date | null;
  finalizedAt: Date | null;
  cancelledAt: Date | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  cancellationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: { id: string; email: string | null; phone: string | null };
  approvedBy: { id: string; email: string | null; phone: string | null } | null;
  finalizedBy: { id: string; email: string | null; phone: string | null } | null;
  cancelledBy: { id: string; email: string | null; phone: string | null } | null;
  rejectedBy: { id: string; email: string | null; phone: string | null } | null;
  items: AdjustmentItemRow[];
};

const USER_SELECT = { select: { id: true, email: true, phone: true } };

const ITEM_INCLUDE = {
  product:  { select: { id: true, sku: true, name: true, uom: { select: { code: true } } } },
  location: { select: { id: true, code: true, name: true } },
};

const REQUEST_INCLUDE = {
  createdBy:   USER_SELECT,
  approvedBy:  USER_SELECT,
  finalizedBy: USER_SELECT,
  cancelledBy: USER_SELECT,
  rejectedBy:  USER_SELECT,
  items: { include: ITEM_INCLUDE, orderBy: { createdAt: 'asc' as const } },
};

export class StockAdjustmentRepository {
  async findAll(params: {
    status?: AdjustmentRequestStatus;
    startDate?: Date;
    endDate?: Date;
    page: number;
    limit: number;
    locationIds?: string[];
    creatorId?: string;
    filterLocationId?: string;
  }): Promise<{ data: AdjustmentRequestRow[]; total: number }> {
    const { status, startDate, endDate, page, limit, locationIds, creatorId, filterLocationId } = params;
    const where: Record<string, unknown> = {};
    if (status)    where['status']    = status;
    if (startDate || endDate) {
      where['createdAt'] = {
        ...(startDate ? { gte: startDate } : {}),
        ...(endDate   ? { lte: endDate   } : {}),
      };
    }
    // Non-admin: scope to accessible locations OR own requests (so empty drafts remain visible to creator)
    if (locationIds) {
      where['OR'] = [
        { items: { some: { locationId: { in: locationIds } } } },
        ...(creatorId ? [{ createdById: creatorId }] : []),
      ];
    }
    // Admin: explicit location filter (from query param)
    if (filterLocationId) {
      where['items'] = { some: { locationId: filterLocationId } };
    }

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      prisma.stockAdjustmentRequest.findMany({
        where,
        skip,
        take: limit,
        include: REQUEST_INCLUDE,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.stockAdjustmentRequest.count({ where }),
    ]);

    return { data: data as AdjustmentRequestRow[], total };
  }

  async findById(id: string): Promise<AdjustmentRequestRow | null> {
    return prisma.stockAdjustmentRequest.findUnique({
      where: { id },
      include: REQUEST_INCLUDE,
    }) as Promise<AdjustmentRequestRow | null>;
  }

  async create(data: {
    requestNumber: string;
    createdById: string;
    notes?: string;
  }): Promise<AdjustmentRequestRow> {
    return prisma.stockAdjustmentRequest.create({
      data: {
        requestNumber: data.requestNumber,
        createdById:   data.createdById,
        notes:         data.notes,
        status:        AdjustmentRequestStatus.DRAFT,
      },
      include: REQUEST_INCLUDE,
    }) as Promise<AdjustmentRequestRow>;
  }

  async deleteById(id: string): Promise<void> {
    await prisma.stockAdjustmentItem.deleteMany({ where: { requestId: id } });
    await prisma.stockAdjustmentRequest.delete({ where: { id } });
  }

  async addItem(data: {
    requestId: string;
    productId: string;
    locationId: string;
    qtyChange: number;
    reason?: string;
  }): Promise<AdjustmentItemRow> {
    return prisma.stockAdjustmentItem.create({
      data,
      include: ITEM_INCLUDE,
    }) as Promise<AdjustmentItemRow>;
  }

  async updateItem(itemId: string, data: {
    productId?: string;
    locationId?: string;
    qtyChange?: number;
    reason?: string;
  }): Promise<AdjustmentItemRow> {
    return prisma.stockAdjustmentItem.update({
      where: { id: itemId },
      data,
      include: ITEM_INCLUDE,
    }) as Promise<AdjustmentItemRow>;
  }

  async deleteItem(itemId: string): Promise<void> {
    await prisma.stockAdjustmentItem.delete({ where: { id: itemId } });
  }

  async findItemById(itemId: string): Promise<AdjustmentItemRow | null> {
    return prisma.stockAdjustmentItem.findUnique({
      where: { id: itemId },
      include: ITEM_INCLUDE,
    }) as Promise<AdjustmentItemRow | null>;
  }

  async updateStatus(id: string, data: {
    status: AdjustmentRequestStatus;
    approvedById?: string;
    finalizedById?: string;
    rejectedById?: string;
    approvedAt?: Date;
    finalizedAt?: Date;
    rejectedAt?: Date;
    rejectionReason?: string;
    notes?: string;
  }): Promise<AdjustmentRequestRow> {
    return prisma.stockAdjustmentRequest.update({
      where: { id },
      data,
      include: REQUEST_INCLUDE,
    }) as Promise<AdjustmentRequestRow>;
  }

  async countByDatePrefix(prefix: string): Promise<number> {
    return prisma.stockAdjustmentRequest.count({
      where: { requestNumber: { startsWith: prefix } },
    });
  }

  // C1: Atomically transition APPROVED → FINALIZED; returns true if claim succeeded.
  async claimFinalization(id: string, userId: string, now: Date): Promise<boolean> {
    const result = await prisma.stockAdjustmentRequest.updateMany({
      where: { id, status: AdjustmentRequestStatus.APPROVED },
      data:  { status: AdjustmentRequestStatus.FINALIZED, finalizedById: userId, finalizedAt: now },
    });
    return result.count > 0;
  }

  // Atomically transition SUBMITTED → REJECTED; returns true if claim succeeded.
  async claimRejection(id: string, userId: string, now: Date, reason: string): Promise<boolean> {
    const result = await prisma.stockAdjustmentRequest.updateMany({
      where: { id, status: AdjustmentRequestStatus.SUBMITTED },
      data:  { status: AdjustmentRequestStatus.REJECTED, rejectedById: userId, rejectedAt: now, rejectionReason: reason },
    });
    return result.count > 0;
  }

  // Atomically transition any allowed status → CANCELLED; returns true if claim succeeded.
  async claimCancellation(id: string, userId: string, now: Date, allowedStatuses: AdjustmentRequestStatus[], cancellationReason: string): Promise<boolean> {
    const result = await prisma.stockAdjustmentRequest.updateMany({
      where: { id, status: { in: allowedStatuses } },
      data:  { status: AdjustmentRequestStatus.CANCELLED, cancelledById: userId, cancelledAt: now, cancellationReason },
    });
    return result.count > 0;
  }
}

export const stockAdjustmentRepository = new StockAdjustmentRepository();
