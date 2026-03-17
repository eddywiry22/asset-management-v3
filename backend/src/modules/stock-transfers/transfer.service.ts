import { TransferRequestStatus, Role } from '@prisma/client';
import {
  transferRepository,
  TransferRequestRow,
  TransferItemRow,
} from './transfer.repository';
import { stockService } from '../stock/stock.service';
import { NotFoundError, ValidationError, ForbiddenError } from '../../utils/errors';
import { assertUserCanAccessLocation } from '../../utils/guards';
import { CreateTransferDto, AddItemDto, UpdateItemDto } from './transfer.validator';
import { auditService } from '../../services/audit.service';
import prisma from '../../config/database';

type UserCtx = { id: string; isAdmin: boolean };

export class TransferService {
  // -------------------------------------------------------------------------
  // Request Number Generator: TRF-YYYYMMDD-XXXX  (retry on collision)
  // -------------------------------------------------------------------------
  private async generateRequestNumber(): Promise<string> {
    const now    = new Date();
    const y      = now.getFullYear();
    const m      = String(now.getMonth() + 1).padStart(2, '0');
    const d      = String(now.getDate()).padStart(2, '0');
    const prefix = `TRF-${y}${m}${d}-`;

    const count = await transferRepository.countByDatePrefix(prefix);
    const seq   = String(count + 1).padStart(4, '0');
    return `${prefix}${seq}`;
  }

  // -------------------------------------------------------------------------
  // List transfers
  // -------------------------------------------------------------------------
  async findAll(params: {
    status?: TransferRequestStatus;
    startDate?: Date;
    endDate?: Date;
    page: number;
    limit: number;
  }): Promise<{ data: TransferRequestRow[]; total: number }> {
    return transferRepository.findAll(params);
  }

  // -------------------------------------------------------------------------
  // Get by id
  // -------------------------------------------------------------------------
  async findById(id: string): Promise<TransferRequestRow> {
    const req = await transferRepository.findById(id);
    if (!req) throw new NotFoundError(`Stock transfer request not found: ${id}`);
    return req;
  }

  // -------------------------------------------------------------------------
  // Create DRAFT request
  // Part 2: sourceLocationId must equal user's assigned location (non-admins)
  // -------------------------------------------------------------------------
  async create(dto: CreateTransferDto, user: UserCtx): Promise<TransferRequestRow> {
    if (dto.sourceLocationId === dto.destinationLocationId) {
      throw new ValidationError('Source and destination locations must be different');
    }

    // Part 2: only admin can create requests for locations they are not assigned to
    await assertUserCanAccessLocation(user.id, user.isAdmin, dto.sourceLocationId);

    const source = await prisma.location.findUnique({ where: { id: dto.sourceLocationId } });
    if (!source) throw new NotFoundError(`Source location not found: ${dto.sourceLocationId}`);

    const dest = await prisma.location.findUnique({ where: { id: dto.destinationLocationId } });
    if (!dest) throw new NotFoundError(`Destination location not found: ${dto.destinationLocationId}`);

    for (let attempt = 0; attempt < 5; attempt++) {
      const requestNumber = await this.generateRequestNumber();
      try {
        const request = await transferRepository.create({
          requestNumber,
          sourceLocationId:      dto.sourceLocationId,
          destinationLocationId: dto.destinationLocationId,
          createdById:           user.id,
          notes:                 dto.notes,
        });

        void auditService.log({
          entityType:  'STOCK_TRANSFER_REQUEST',
          entityId:    request.id,
          action:      'TRANSFER_CREATE',
          performedBy: user.id,
          afterValue: {
            status:                'DRAFT',
            sourceLocationId:      request.sourceLocationId,
            destinationLocationId: request.destinationLocationId,
          },
        });

        return request;
      } catch (err: any) {
        if (err?.code === 'P2002' && attempt < 4) continue; // unique collision — retry
        throw err;
      }
    }
    throw new ValidationError('Unable to generate a unique request number');
  }

  // -------------------------------------------------------------------------
  // Add item (DRAFT only)  — Part 1: guard by sourceLocationId
  // -------------------------------------------------------------------------
  async addItem(requestId: string, dto: AddItemDto, user: UserCtx): Promise<TransferItemRow> {
    const req = await this.findById(requestId);
    if (req.status !== TransferRequestStatus.DRAFT) {
      throw new ValidationError('Items can only be added when the request is in DRAFT status');
    }
    await assertUserCanAccessLocation(user.id, user.isAdmin, req.sourceLocationId);

    const product = await prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) throw new NotFoundError(`Product not found: ${dto.productId}`);

    return transferRepository.addItem({
      requestId,
      productId: dto.productId,
      qty:       dto.qty,
    });
  }

  // -------------------------------------------------------------------------
  // Update item qty (DRAFT only)  — Part 1: guard by sourceLocationId
  // -------------------------------------------------------------------------
  async updateItem(requestId: string, itemId: string, dto: UpdateItemDto, user: UserCtx): Promise<TransferItemRow> {
    const req = await this.findById(requestId);
    if (req.status !== TransferRequestStatus.DRAFT) {
      throw new ValidationError('Items can only be edited when the request is in DRAFT status');
    }
    await assertUserCanAccessLocation(user.id, user.isAdmin, req.sourceLocationId);

    const item = await transferRepository.findItemById(itemId);
    if (!item || item.requestId !== requestId) {
      throw new NotFoundError(`Item not found: ${itemId}`);
    }
    return transferRepository.updateItem(itemId, dto.qty);
  }

  // -------------------------------------------------------------------------
  // Delete item (DRAFT only)  — Part 1: guard by sourceLocationId
  // -------------------------------------------------------------------------
  async deleteItem(requestId: string, itemId: string, user: UserCtx): Promise<void> {
    const req = await this.findById(requestId);
    if (req.status !== TransferRequestStatus.DRAFT) {
      throw new ValidationError('Items can only be deleted when the request is in DRAFT status');
    }
    await assertUserCanAccessLocation(user.id, user.isAdmin, req.sourceLocationId);

    const item = await transferRepository.findItemById(itemId);
    if (!item || item.requestId !== requestId) {
      throw new NotFoundError(`Item not found: ${itemId}`);
    }
    await transferRepository.deleteItem(itemId);
  }

  // -------------------------------------------------------------------------
  // Approve (DRAFT → APPROVED)  — Part 3: managers and admins only
  // Part 1: guard by sourceLocationId
  // -------------------------------------------------------------------------
  async approve(requestId: string, user: UserCtx): Promise<TransferRequestRow> {
    // Role check: manager or admin only
    if (!user.isAdmin) {
      const roles = await prisma.userLocationRole.findMany({
        where: { userId: user.id },
        select: { role: true },
      });
      const isManager = roles.some((r) => r.role === Role.MANAGER);
      if (!isManager) {
        throw new ForbiddenError('Only managers or admins can approve transfer requests');
      }
    }

    const req = await this.findById(requestId);
    if (req.status !== TransferRequestStatus.DRAFT) {
      throw new ValidationError(`Cannot approve a request with status ${req.status}`);
    }
    if (!req.items || req.items.length === 0) {
      throw new ValidationError('Cannot approve a transfer with no items');
    }

    // Location guard: approver must have access to source location
    await assertUserCanAccessLocation(user.id, user.isAdmin, req.sourceLocationId);

    const updated = await transferRepository.updateStatus(requestId, {
      status: TransferRequestStatus.APPROVED,
    });

    void auditService.log({
      entityType:  'STOCK_TRANSFER_REQUEST',
      entityId:    requestId,
      action:      'STATUS_CHANGE',
      afterValue:  { status: 'APPROVED' },
      performedBy: user.id,
    });

    return updated;
  }

  // -------------------------------------------------------------------------
  // Reject (DRAFT → REJECTED)  — Part 3: managers and admins only
  // Part 1: guard by sourceLocationId
  // -------------------------------------------------------------------------
  async reject(requestId: string, user: UserCtx): Promise<TransferRequestRow> {
    // Role check: manager or admin only
    if (!user.isAdmin) {
      const roles = await prisma.userLocationRole.findMany({
        where: { userId: user.id },
        select: { role: true },
      });
      const isManager = roles.some((r) => r.role === Role.MANAGER);
      if (!isManager) {
        throw new ForbiddenError('Only managers or admins can reject transfer requests');
      }
    }

    const req = await this.findById(requestId);
    if (req.status !== TransferRequestStatus.DRAFT) {
      throw new ValidationError(`Cannot reject a request with status ${req.status}`);
    }

    // Location guard: rejecter must have access to source location
    await assertUserCanAccessLocation(user.id, user.isAdmin, req.sourceLocationId);

    const updated = await transferRepository.updateStatus(requestId, {
      status: TransferRequestStatus.REJECTED,
    });

    void auditService.log({
      entityType:  'STOCK_TRANSFER_REQUEST',
      entityId:    requestId,
      action:      'STATUS_CHANGE',
      afterValue:  { status: 'REJECTED' },
      performedBy: user.id,
    });

    return updated;
  }

  // -------------------------------------------------------------------------
  // Finalize (APPROVED → FINALIZED)  — Part 1/3
  // Changed from DRAFT → FINALIZED to APPROVED → FINALIZED
  // -------------------------------------------------------------------------
  async finalize(requestId: string, user: UserCtx): Promise<TransferRequestRow> {
    const req = await this.findById(requestId);

    if (req.status !== TransferRequestStatus.APPROVED) {
      throw new ValidationError(`Cannot finalize a request with status ${req.status}`);
    }
    if (!req.items || req.items.length === 0) {
      throw new ValidationError('Cannot finalize a transfer with no items');
    }
    if (req.sourceLocationId === req.destinationLocationId) {
      throw new ValidationError('Source and destination locations must be different');
    }

    // Location guard: finalizer must have access to source location
    await assertUserCanAccessLocation(user.id, user.isAdmin, req.sourceLocationId);

    // Atomically claim: only the first concurrent caller transitions APPROVED → FINALIZED.
    const claimed = await transferRepository.claimFinalization(requestId, new Date());
    if (!claimed) {
      throw new ValidationError(`Cannot finalize a request with status ${req.status}`);
    }

    // Apply stock moves (each call is internally transactional).
    for (const item of req.items) {
      await stockService.moveStock({
        productId:             item.productId,
        sourceLocationId:      req.sourceLocationId,
        destinationLocationId: req.destinationLocationId,
        qty:                   Number(item.qty),
        sourceId:              requestId,
      });
    }

    void auditService.log({
      entityType:  'STOCK_TRANSFER_REQUEST',
      entityId:    requestId,
      action:      'STATUS_CHANGE',
      afterValue:  { status: 'FINALIZED' },
      performedBy: user.id,
    });

    return (await transferRepository.findById(requestId))!;
  }
}

export const transferService = new TransferService();
