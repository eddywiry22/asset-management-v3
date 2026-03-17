import prisma from '../../config/database';
import { TransferRequestStatus } from '@prisma/client';

export type TransferItemRow = {
  id: string;
  requestId: string;
  productId: string;
  qty: any;
  createdAt: Date;
  product: { id: string; sku: string; name: string; uom: { code: string } };
};

export type TransferRequestRow = {
  id: string;
  requestNumber: string;
  status: TransferRequestStatus;
  sourceLocationId: string;
  destinationLocationId: string;
  notes: string | null;
  createdById: string;
  submittedAt: Date | null;
  originApprovedById: string | null;
  originApprovedAt: Date | null;
  destinationApprovedById: string | null;
  destinationApprovedAt: Date | null;
  finalizedAt: Date | null;
  cancelledById: string | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: { id: string; email: string | null; phone: string | null };
  originApprovedBy: { id: string; email: string | null; phone: string | null } | null;
  destinationApprovedBy: { id: string; email: string | null; phone: string | null } | null;
  cancelledBy: { id: string; email: string | null; phone: string | null } | null;
  sourceLocation: { id: string; code: string; name: string };
  destinationLocation: { id: string; code: string; name: string };
  items: TransferItemRow[];
};

const USER_SELECT = { select: { id: true, email: true, phone: true } };

const ITEM_INCLUDE = {
  product: { select: { id: true, sku: true, name: true, uom: { select: { code: true } } } },
};

const REQUEST_INCLUDE = {
  createdBy:            USER_SELECT,
  originApprovedBy:     USER_SELECT,
  destinationApprovedBy: USER_SELECT,
  cancelledBy:          USER_SELECT,
  sourceLocation:       { select: { id: true, code: true, name: true } },
  destinationLocation:  { select: { id: true, code: true, name: true } },
  items: { include: ITEM_INCLUDE, orderBy: { createdAt: 'asc' as const } },
};

export class TransferRepository {
  async findAll(params: {
    status?: TransferRequestStatus;
    startDate?: Date;
    endDate?: Date;
    page: number;
    limit: number;
  }): Promise<{ data: TransferRequestRow[]; total: number }> {
    const { status, startDate, endDate, page, limit } = params;
    const where: Record<string, unknown> = {};
    if (status) where['status'] = status;
    if (startDate || endDate) {
      where['createdAt'] = {
        ...(startDate ? { gte: startDate } : {}),
        ...(endDate   ? { lte: endDate   } : {}),
      };
    }

    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      prisma.stockTransferRequest.findMany({
        where,
        skip,
        take: limit,
        include: REQUEST_INCLUDE,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.stockTransferRequest.count({ where }),
    ]);

    return { data: data as TransferRequestRow[], total };
  }

  async findById(id: string): Promise<TransferRequestRow | null> {
    return prisma.stockTransferRequest.findUnique({
      where: { id },
      include: REQUEST_INCLUDE,
    }) as Promise<TransferRequestRow | null>;
  }

  async create(data: {
    requestNumber: string;
    sourceLocationId: string;
    destinationLocationId: string;
    createdById: string;
    notes?: string;
  }): Promise<TransferRequestRow> {
    return prisma.stockTransferRequest.create({
      data: {
        requestNumber:         data.requestNumber,
        sourceLocationId:      data.sourceLocationId,
        destinationLocationId: data.destinationLocationId,
        createdById:           data.createdById,
        notes:                 data.notes,
        status:                TransferRequestStatus.DRAFT,
      },
      include: REQUEST_INCLUDE,
    }) as Promise<TransferRequestRow>;
  }

  async deleteById(id: string): Promise<void> {
    // Delete items first (no cascade), then the request
    await prisma.stockTransferItem.deleteMany({ where: { requestId: id } });
    await prisma.stockTransferRequest.delete({ where: { id } });
  }

  async addItem(data: {
    requestId: string;
    productId: string;
    qty: number;
  }): Promise<TransferItemRow> {
    return prisma.stockTransferItem.create({
      data,
      include: ITEM_INCLUDE,
    }) as Promise<TransferItemRow>;
  }

  async updateItem(itemId: string, qty: number): Promise<TransferItemRow> {
    return prisma.stockTransferItem.update({
      where: { id: itemId },
      data:  { qty },
      include: ITEM_INCLUDE,
    }) as Promise<TransferItemRow>;
  }

  async deleteItem(itemId: string): Promise<void> {
    await prisma.stockTransferItem.delete({ where: { id: itemId } });
  }

  async findItemById(itemId: string): Promise<TransferItemRow | null> {
    return prisma.stockTransferItem.findUnique({
      where: { id: itemId },
      include: ITEM_INCLUDE,
    }) as Promise<TransferItemRow | null>;
  }

  async countByDatePrefix(prefix: string): Promise<number> {
    return prisma.stockTransferRequest.count({
      where: { requestNumber: { startsWith: prefix } },
    });
  }

  // Atomically transition DRAFT → SUBMITTED
  async claimSubmit(id: string, now: Date): Promise<boolean> {
    const result = await prisma.stockTransferRequest.updateMany({
      where: { id, status: TransferRequestStatus.DRAFT },
      data:  { status: TransferRequestStatus.SUBMITTED, submittedAt: now },
    });
    return result.count > 0;
  }

  // Atomically transition SUBMITTED → ORIGIN_MANAGER_APPROVED
  async claimOriginApproval(id: string, approvedById: string, now: Date): Promise<boolean> {
    const result = await prisma.stockTransferRequest.updateMany({
      where: { id, status: TransferRequestStatus.SUBMITTED },
      data:  {
        status:            TransferRequestStatus.ORIGIN_MANAGER_APPROVED,
        originApprovedById: approvedById,
        originApprovedAt:   now,
      },
    });
    return result.count > 0;
  }

  // Atomically transition ORIGIN_MANAGER_APPROVED → READY_TO_FINALIZE
  async claimDestinationApproval(id: string, approvedById: string, now: Date): Promise<boolean> {
    const result = await prisma.stockTransferRequest.updateMany({
      where: { id, status: TransferRequestStatus.ORIGIN_MANAGER_APPROVED },
      data:  {
        status:                  TransferRequestStatus.READY_TO_FINALIZE,
        destinationApprovedById: approvedById,
        destinationApprovedAt:   now,
      },
    });
    return result.count > 0;
  }

  // Atomically transition READY_TO_FINALIZE → FINALIZED
  async claimFinalization(id: string, now: Date): Promise<boolean> {
    const result = await prisma.stockTransferRequest.updateMany({
      where: { id, status: TransferRequestStatus.READY_TO_FINALIZE },
      data:  { status: TransferRequestStatus.FINALIZED, finalizedAt: now },
    });
    return result.count > 0;
  }

  // Cancel: any pre-finalized state → CANCELLED (atomic)
  async claimCancellation(id: string, cancelledById: string, now: Date, allowedStatuses: TransferRequestStatus[]): Promise<boolean> {
    const result = await prisma.stockTransferRequest.updateMany({
      where: { id, status: { in: allowedStatuses } },
      data:  { status: TransferRequestStatus.CANCELLED, cancelledById, cancelledAt: now },
    });
    return result.count > 0;
  }
}

export const transferRepository = new TransferRepository();
