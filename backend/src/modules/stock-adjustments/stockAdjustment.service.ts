import { AdjustmentRequestStatus, Role } from '@prisma/client';
import {
  stockAdjustmentRepository,
  AdjustmentRequestRow,
  AdjustmentItemRow,
} from './stockAdjustment.repository';
import { stockService } from '../stock/stock.service';
import { NotFoundError, ValidationError, ForbiddenError } from '../../utils/errors';
import { CreateRequestDto, AddItemDto, UpdateItemDto } from './stockAdjustment.validator';
import { auditService } from '../../services/audit.service';
import prisma from '../../config/database';

export class StockAdjustmentService {
  // -------------------------------------------------------------------------
  // Request Number Generator: ADJ-YYYYMMDD-XXXX  (C2: retry on collision)
  // -------------------------------------------------------------------------
  private async generateRequestNumber(): Promise<string> {
    const now    = new Date();
    const y      = now.getFullYear();
    const m      = String(now.getMonth() + 1).padStart(2, '0');
    const d      = String(now.getDate()).padStart(2, '0');
    const prefix = `ADJ-${y}${m}${d}-`;

    const count = await stockAdjustmentRepository.countByDatePrefix(prefix);
    const seq   = String(count + 1).padStart(4, '0');
    return `${prefix}${seq}`;
  }

  // -------------------------------------------------------------------------
  // List requests
  // -------------------------------------------------------------------------
  async findAll(params: {
    status?: AdjustmentRequestStatus;
    startDate?: Date;
    endDate?: Date;
    page: number;
    limit: number;
  }): Promise<{ data: AdjustmentRequestRow[]; total: number }> {
    return stockAdjustmentRepository.findAll(params);
  }

  // -------------------------------------------------------------------------
  // Get by id
  // -------------------------------------------------------------------------
  async findById(id: string): Promise<AdjustmentRequestRow> {
    const req = await stockAdjustmentRepository.findById(id);
    if (!req) throw new NotFoundError(`Stock adjustment request not found: ${id}`);
    return req;
  }

  // -------------------------------------------------------------------------
  // Create request  (C2: retry on unique constraint collision)
  // -------------------------------------------------------------------------
  async create(dto: CreateRequestDto, userId: string): Promise<AdjustmentRequestRow> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const requestNumber = await this.generateRequestNumber();
      try {
        return await stockAdjustmentRepository.create({
          requestNumber,
          createdById: userId,
          notes: dto.notes,
        });
      } catch (err: any) {
        if (err?.code === 'P2002' && attempt < 4) continue; // unique collision — retry
        throw err;
      }
    }
    throw new ValidationError('Unable to generate a unique request number');
  }

  // -------------------------------------------------------------------------
  // Add item (DRAFT only)  (W3: pre-validate productId/locationId)
  // -------------------------------------------------------------------------
  async addItem(requestId: string, dto: AddItemDto): Promise<AdjustmentItemRow> {
    const req = await this.findById(requestId);
    if (req.status !== AdjustmentRequestStatus.DRAFT) {
      throw new ValidationError('Items can only be added when the request is in DRAFT status');
    }
    const product = await prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) throw new NotFoundError(`Product not found: ${dto.productId}`);
    const location = await prisma.location.findUnique({ where: { id: dto.locationId } });
    if (!location) throw new NotFoundError(`Location not found: ${dto.locationId}`);
    return stockAdjustmentRepository.addItem({
      requestId,
      productId:  dto.productId,
      locationId: dto.locationId,
      qtyChange:  dto.qtyChange,
      reason:     dto.reason,
    });
  }

  // -------------------------------------------------------------------------
  // Update item (DRAFT only)
  // -------------------------------------------------------------------------
  async updateItem(requestId: string, itemId: string, dto: UpdateItemDto): Promise<AdjustmentItemRow> {
    const req  = await this.findById(requestId);
    if (req.status !== AdjustmentRequestStatus.DRAFT) {
      throw new ValidationError('Items can only be edited when the request is in DRAFT status');
    }
    const item = await stockAdjustmentRepository.findItemById(itemId);
    if (!item || item.requestId !== requestId) {
      throw new NotFoundError(`Item not found: ${itemId}`);
    }
    return stockAdjustmentRepository.updateItem(itemId, dto);
  }

  // -------------------------------------------------------------------------
  // Delete item (DRAFT only)
  // -------------------------------------------------------------------------
  async deleteItem(requestId: string, itemId: string): Promise<void> {
    const req  = await this.findById(requestId);
    if (req.status !== AdjustmentRequestStatus.DRAFT) {
      throw new ValidationError('Items can only be deleted when the request is in DRAFT status');
    }
    const item = await stockAdjustmentRepository.findItemById(itemId);
    if (!item || item.requestId !== requestId) {
      throw new NotFoundError(`Item not found: ${itemId}`);
    }
    await stockAdjustmentRepository.deleteItem(itemId);
  }

  // -------------------------------------------------------------------------
  // Submit (DRAFT → SUBMITTED)  (W14: audit log)
  // -------------------------------------------------------------------------
  async submit(requestId: string, userId: string): Promise<AdjustmentRequestRow> {
    const req = await this.findById(requestId);
    if (req.status !== AdjustmentRequestStatus.DRAFT) {
      throw new ValidationError(`Cannot submit a request with status ${req.status}`);
    }
    if (!req.items || req.items.length === 0) {
      throw new ValidationError('Request must contain at least one item before submission');
    }
    const updated = await stockAdjustmentRepository.updateStatus(requestId, {
      status: AdjustmentRequestStatus.SUBMITTED,
    });
    void auditService.log({ entityType: 'STOCK_ADJUSTMENT_REQUEST', entityId: requestId, action: 'STATUS_CHANGE', afterValue: { status: 'SUBMITTED' }, performedBy: userId });
    return updated;
  }

  // -------------------------------------------------------------------------
  // Approve (SUBMITTED → APPROVED) — managers and admins only  (W14: audit log)
  // -------------------------------------------------------------------------
  async approve(requestId: string, userId: string, userRoles: { isAdmin: boolean; locationRoles: string[] }): Promise<AdjustmentRequestRow> {
    if (!userRoles.isAdmin && !userRoles.locationRoles.includes(Role.MANAGER)) {
      throw new ForbiddenError('Only managers or admins can approve adjustment requests');
    }
    const req = await this.findById(requestId);
    if (req.status !== AdjustmentRequestStatus.SUBMITTED) {
      throw new ValidationError(`Cannot approve a request with status ${req.status}`);
    }
    if (!req.items || req.items.length === 0) {
      throw new ValidationError('Cannot approve a request with no items');
    }
    const updated = await stockAdjustmentRepository.updateStatus(requestId, {
      status:      AdjustmentRequestStatus.APPROVED,
      approvedById: userId,
      approvedAt:   new Date(),
    });
    void auditService.log({ entityType: 'STOCK_ADJUSTMENT_REQUEST', entityId: requestId, action: 'STATUS_CHANGE', afterValue: { status: 'APPROVED' }, performedBy: userId });
    return updated;
  }

  // -------------------------------------------------------------------------
  // Reject (SUBMITTED → REJECTED) — managers and admins only  (W14: audit log)
  // -------------------------------------------------------------------------
  async reject(requestId: string, userId: string, userRoles: { isAdmin: boolean; locationRoles: string[] }, notes?: string): Promise<AdjustmentRequestRow> {
    if (!userRoles.isAdmin && !userRoles.locationRoles.includes(Role.MANAGER)) {
      throw new ForbiddenError('Only managers or admins can reject adjustment requests');
    }
    const req = await this.findById(requestId);
    if (req.status !== AdjustmentRequestStatus.SUBMITTED) {
      throw new ValidationError(`Cannot reject a request with status ${req.status}`);
    }
    const updated = await stockAdjustmentRepository.updateStatus(requestId, {
      status: AdjustmentRequestStatus.REJECTED,
      approvedById: userId,
      approvedAt:   new Date(),
      ...(notes ? { notes } : {}),
    });
    void auditService.log({ entityType: 'STOCK_ADJUSTMENT_REQUEST', entityId: requestId, action: 'STATUS_CHANGE', afterValue: { status: 'REJECTED' }, performedBy: userId });
    return updated;
  }

  // -------------------------------------------------------------------------
  // Finalize (APPROVED → FINALIZED)  (C1: optimistic concurrency, W14: audit)
  // -------------------------------------------------------------------------
  async finalize(requestId: string, userId: string): Promise<AdjustmentRequestRow> {
    const req = await this.findById(requestId);
    if (req.status !== AdjustmentRequestStatus.APPROVED) {
      throw new ValidationError(`Cannot finalize a request with status ${req.status}`);
    }

    // Atomically claim: only the first concurrent caller transitions APPROVED → FINALIZED.
    const claimed = await stockAdjustmentRepository.claimFinalization(requestId, userId, new Date());
    if (!claimed) {
      throw new ValidationError(`Cannot finalize a request with status ${req.status}`);
    }

    // Apply stock adjustments (each call is internally transactional).
    for (const item of req.items) {
      await stockService.applyAdjustment({
        productId:  item.productId,
        locationId: item.locationId,
        qtyChange:  Number(item.qtyChange),
        sourceId:   requestId,
      });
    }

    void auditService.log({ entityType: 'STOCK_ADJUSTMENT_REQUEST', entityId: requestId, action: 'STATUS_CHANGE', afterValue: { status: 'FINALIZED' }, performedBy: userId });
    return (await stockAdjustmentRepository.findById(requestId))!;
  }
}

export const stockAdjustmentService = new StockAdjustmentService();
