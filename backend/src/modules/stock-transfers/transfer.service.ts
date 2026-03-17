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

// States that can still be cancelled by the creator.
// DRAFT is excluded: a DRAFT request must be deleted (DELETE /:id), not cancelled.
const CANCELLABLE_STATUSES: TransferRequestStatus[] = [
  TransferRequestStatus.SUBMITTED,
  TransferRequestStatus.ORIGIN_MANAGER_APPROVED,
  TransferRequestStatus.READY_TO_FINALIZE,
];

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
  // Non-admins must have access to the source location
  // -------------------------------------------------------------------------
  async create(dto: CreateTransferDto, user: UserCtx): Promise<TransferRequestRow> {
    if (dto.sourceLocationId === dto.destinationLocationId) {
      throw new ValidationError('Source and destination locations must be different');
    }

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
        if (err?.code === 'P2002' && attempt < 4) continue;
        throw err;
      }
    }
    throw new ValidationError('Unable to generate a unique request number');
  }

  // -------------------------------------------------------------------------
  // Delete DRAFT request (creator only)
  // -------------------------------------------------------------------------
  async deleteRequest(requestId: string, user: UserCtx): Promise<void> {
    const req = await this.findById(requestId);
    if (req.status !== TransferRequestStatus.DRAFT) {
      throw new ValidationError('Only DRAFT requests can be deleted');
    }
    if (!user.isAdmin && req.createdById !== user.id) {
      throw new ForbiddenError('Only the creator can delete a transfer request');
    }
    await transferRepository.deleteById(requestId);
  }

  // -------------------------------------------------------------------------
  // Add item (DRAFT only) — creator must have source location access
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
  // Update item qty (DRAFT only)
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
  // Delete item (DRAFT only)
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
  // Submit (DRAFT → SUBMITTED)
  // Creator must have source location access
  // -------------------------------------------------------------------------
  async submit(requestId: string, user: UserCtx): Promise<TransferRequestRow> {
    const req = await this.findById(requestId);
    if (req.status !== TransferRequestStatus.DRAFT) {
      throw new ValidationError(`Cannot submit a request with status ${req.status}`);
    }
    if (!req.items || req.items.length === 0) {
      throw new ValidationError('Request must contain at least one item before submission');
    }
    await assertUserCanAccessLocation(user.id, user.isAdmin, req.sourceLocationId);

    const claimed = await transferRepository.claimSubmit(requestId, new Date());
    if (!claimed) {
      throw new ValidationError(`Cannot submit a request with status ${req.status}`);
    }

    void auditService.log({
      entityType:  'STOCK_TRANSFER_REQUEST',
      entityId:    requestId,
      action:      'STATUS_CHANGE',
      afterValue:  { status: 'SUBMITTED' },
      performedBy: user.id,
    });

    return (await transferRepository.findById(requestId))!;
  }

  // -------------------------------------------------------------------------
  // Approve Origin (SUBMITTED → ORIGIN_MANAGER_APPROVED)
  // Approver must have MANAGER role specifically at the SOURCE location (or be admin)
  // -------------------------------------------------------------------------
  async approveOrigin(requestId: string, user: UserCtx): Promise<TransferRequestRow> {
    const req = await this.findById(requestId);
    if (req.status !== TransferRequestStatus.SUBMITTED) {
      throw new ValidationError(`Cannot approve origin for a request with status ${req.status}`);
    }
    if (!req.items || req.items.length === 0) {
      throw new ValidationError('Cannot approve a transfer with no items');
    }

    if (!user.isAdmin) {
      // Single query: must have MANAGER role specifically at the source location
      const role = await prisma.userLocationRole.findFirst({
        where: { userId: user.id, locationId: req.sourceLocationId, role: Role.MANAGER },
      });
      if (!role) {
        throw new ForbiddenError('Only a manager at the source location can approve at origin');
      }
    }

    const claimed = await transferRepository.claimOriginApproval(requestId, user.id, new Date());
    if (!claimed) {
      throw new ValidationError(`Cannot approve origin for a request with status ${req.status}`);
    }

    void auditService.log({
      entityType:  'STOCK_TRANSFER_REQUEST',
      entityId:    requestId,
      action:      'STATUS_CHANGE',
      afterValue:  { status: 'ORIGIN_MANAGER_APPROVED' },
      performedBy: user.id,
    });

    return (await transferRepository.findById(requestId))!;
  }

  // -------------------------------------------------------------------------
  // Approve Destination (ORIGIN_MANAGER_APPROVED → READY_TO_FINALIZE)
  // Approver must have access to the DESTINATION location
  // -------------------------------------------------------------------------
  async approveDestination(requestId: string, user: UserCtx): Promise<TransferRequestRow> {
    const req = await this.findById(requestId);
    if (req.status !== TransferRequestStatus.ORIGIN_MANAGER_APPROVED) {
      throw new ValidationError(`Cannot approve destination for a request with status ${req.status}`);
    }

    await assertUserCanAccessLocation(user.id, user.isAdmin, req.destinationLocationId);

    const claimed = await transferRepository.claimDestinationApproval(requestId, user.id, new Date());
    if (!claimed) {
      throw new ValidationError(`Cannot approve destination for a request with status ${req.status}`);
    }

    void auditService.log({
      entityType:  'STOCK_TRANSFER_REQUEST',
      entityId:    requestId,
      action:      'STATUS_CHANGE',
      afterValue:  { status: 'READY_TO_FINALIZE' },
      performedBy: user.id,
    });

    return (await transferRepository.findById(requestId))!;
  }

  // -------------------------------------------------------------------------
  // Reject (SUBMITTED → CANCELLED by source manager)
  //      (ORIGIN_MANAGER_APPROVED → CANCELLED by destination user)
  // -------------------------------------------------------------------------
  async reject(requestId: string, user: UserCtx): Promise<TransferRequestRow> {
    const req = await this.findById(requestId);

    if (req.status === TransferRequestStatus.SUBMITTED) {
      // Stage 1 reject: must be MANAGER at source location (or admin)
      if (!user.isAdmin) {
        const role = await prisma.userLocationRole.findFirst({
          where: { userId: user.id, locationId: req.sourceLocationId, role: Role.MANAGER },
        });
        if (!role) {
          throw new ForbiddenError('Only a manager at the source location can reject at origin stage');
        }
      }
    } else if (req.status === TransferRequestStatus.ORIGIN_MANAGER_APPROVED) {
      // Stage 2 reject: must have any role at destination location (or admin)
      await assertUserCanAccessLocation(user.id, user.isAdmin, req.destinationLocationId);
    } else {
      throw new ValidationError(`Cannot reject a request with status ${req.status}`);
    }

    const claimed = await transferRepository.claimCancellation(
      requestId,
      user.id,
      new Date(),
      [req.status],
    );
    if (!claimed) {
      throw new ValidationError(`Cannot reject a request with status ${req.status}`);
    }

    void auditService.log({
      entityType:  'STOCK_TRANSFER_REQUEST',
      entityId:    requestId,
      action:      'STATUS_CHANGE',
      afterValue:  { status: 'CANCELLED', rejectedFrom: req.status },
      performedBy: user.id,
    });

    return (await transferRepository.findById(requestId))!;
  }

  // -------------------------------------------------------------------------
  // Finalize (READY_TO_FINALIZE → FINALIZED)
  // Finalizer must be admin or have access to DESTINATION location
  // (destination user who approved step 2 can complete the transfer)
  // -------------------------------------------------------------------------
  async finalize(requestId: string, user: UserCtx): Promise<TransferRequestRow> {
    const req = await this.findById(requestId);

    if (req.status !== TransferRequestStatus.READY_TO_FINALIZE) {
      throw new ValidationError(`Cannot finalize a request with status ${req.status}`);
    }
    if (!req.items || req.items.length === 0) {
      throw new ValidationError('Cannot finalize a transfer with no items');
    }
    if (req.sourceLocationId === req.destinationLocationId) {
      throw new ValidationError('Source and destination locations must be different');
    }

    // Non-admin must have access to the destination location
    await assertUserCanAccessLocation(user.id, user.isAdmin, req.destinationLocationId);

    // Atomically claim
    const claimed = await transferRepository.claimFinalization(requestId, new Date());
    if (!claimed) {
      throw new ValidationError(`Cannot finalize a request with status ${req.status}`);
    }

    // Apply stock moves (each call is internally transactional)
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

  // -------------------------------------------------------------------------
  // Cancel (any pre-finalized state → CANCELLED)
  // Creator can cancel their own request; admin can cancel any
  // -------------------------------------------------------------------------
  async cancel(requestId: string, user: UserCtx): Promise<TransferRequestRow> {
    const req = await this.findById(requestId);

    if (!CANCELLABLE_STATUSES.includes(req.status)) {
      throw new ValidationError(`Cannot cancel a request with status ${req.status}`);
    }
    if (!user.isAdmin && req.createdById !== user.id) {
      throw new ForbiddenError('Only the creator or an admin can cancel a transfer request');
    }

    const claimed = await transferRepository.claimCancellation(
      requestId,
      user.id,
      new Date(),
      CANCELLABLE_STATUSES,
    );
    if (!claimed) {
      throw new ValidationError(`Cannot cancel a request with status ${req.status}`);
    }

    void auditService.log({
      entityType:  'STOCK_TRANSFER_REQUEST',
      entityId:    requestId,
      action:      'STATUS_CHANGE',
      afterValue:  { status: 'CANCELLED' },
      performedBy: user.id,
    });

    return (await transferRepository.findById(requestId))!;
  }
}

export const transferService = new TransferService();
