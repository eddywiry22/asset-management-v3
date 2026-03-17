import { AdjustmentRequestStatus, Role } from '@prisma/client';
import {
  stockAdjustmentRepository,
  AdjustmentRequestRow,
  AdjustmentItemRow,
} from './stockAdjustment.repository';
import { stockService } from '../stock/stock.service';
import { NotFoundError, ValidationError, ForbiddenError } from '../../utils/errors';
import { CreateRequestDto, AddItemDto, UpdateItemDto } from './stockAdjustment.validator';

export class StockAdjustmentService {
  // -------------------------------------------------------------------------
  // Request Number Generator: ADJ-YYYYMMDD-XXXX
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
  // Create request
  // -------------------------------------------------------------------------
  async create(dto: CreateRequestDto, userId: string): Promise<AdjustmentRequestRow> {
    const requestNumber = await this.generateRequestNumber();
    return stockAdjustmentRepository.create({
      requestNumber,
      createdById: userId,
      notes: dto.notes,
    });
  }

  // -------------------------------------------------------------------------
  // Add item (DRAFT only)
  // -------------------------------------------------------------------------
  async addItem(requestId: string, dto: AddItemDto): Promise<AdjustmentItemRow> {
    const req = await this.findById(requestId);
    if (req.status !== AdjustmentRequestStatus.DRAFT) {
      throw new ValidationError('Items can only be added when the request is in DRAFT status');
    }
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
  // Submit (DRAFT → SUBMITTED)
  // -------------------------------------------------------------------------
  async submit(requestId: string): Promise<AdjustmentRequestRow> {
    const req = await this.findById(requestId);
    if (req.status !== AdjustmentRequestStatus.DRAFT) {
      throw new ValidationError(`Cannot submit a request with status ${req.status}`);
    }
    if (!req.items || req.items.length === 0) {
      throw new ValidationError('Request must contain at least one item before submission');
    }
    return stockAdjustmentRepository.updateStatus(requestId, {
      status: AdjustmentRequestStatus.SUBMITTED,
    });
  }

  // -------------------------------------------------------------------------
  // Approve (SUBMITTED → APPROVED) — managers and admins only
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
    return stockAdjustmentRepository.updateStatus(requestId, {
      status:      AdjustmentRequestStatus.APPROVED,
      approvedById: userId,
      approvedAt:   new Date(),
    });
  }

  // -------------------------------------------------------------------------
  // Reject (SUBMITTED → REJECTED) — managers and admins only
  // -------------------------------------------------------------------------
  async reject(requestId: string, userId: string, userRoles: { isAdmin: boolean; locationRoles: string[] }, notes?: string): Promise<AdjustmentRequestRow> {
    if (!userRoles.isAdmin && !userRoles.locationRoles.includes(Role.MANAGER)) {
      throw new ForbiddenError('Only managers or admins can reject adjustment requests');
    }
    const req = await this.findById(requestId);
    if (req.status !== AdjustmentRequestStatus.SUBMITTED) {
      throw new ValidationError(`Cannot reject a request with status ${req.status}`);
    }
    return stockAdjustmentRepository.updateStatus(requestId, {
      status: AdjustmentRequestStatus.REJECTED,
      approvedById: userId,
      approvedAt:   new Date(),
      ...(notes ? { notes } : {}),
    });
  }

  // -------------------------------------------------------------------------
  // Finalize (APPROVED → FINALIZED) — calls stockService.applyAdjustment per item
  // -------------------------------------------------------------------------
  async finalize(requestId: string, userId: string): Promise<AdjustmentRequestRow> {
    const req = await this.findById(requestId);
    if (req.status !== AdjustmentRequestStatus.APPROVED) {
      throw new ValidationError(`Cannot finalize a request with status ${req.status}`);
    }

    // Call applyAdjustment for each item (each call is itself transactional).
    // If any item fails, an error is thrown and status remains APPROVED.
    for (const item of req.items) {
      await stockService.applyAdjustment({
        productId:  item.productId,
        locationId: item.locationId,
        qtyChange:  Number(item.qtyChange),
        sourceId:   requestId,
      });
    }

    return stockAdjustmentRepository.updateStatus(requestId, {
      status:       AdjustmentRequestStatus.FINALIZED,
      finalizedById: userId,
      finalizedAt:   new Date(),
    });
  }
}

export const stockAdjustmentService = new StockAdjustmentService();
