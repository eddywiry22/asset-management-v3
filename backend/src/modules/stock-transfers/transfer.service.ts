import { TransferRequestStatus, Role, ReservationSourceType } from '@prisma/client';
import {
  transferRepository,
  TransferRequestRow,
  TransferItemRow,
} from './transfer.repository';
import { reservationService } from '../stock/reservation.service';
import { NotFoundError, ValidationError, ForbiddenError } from '../../utils/errors';
import { assertUserCanAccessLocation } from '../../utils/guards';
import { CreateTransferDto, AddItemDto, UpdateItemDto } from './transfer.validator';
import { auditService } from '../../services/audit.service';
import prisma from '../../config/database';
import logger from '../../utils/logger';
import {
  validateUserAccess,
  validateLocationActive,
  validateProductActive,
  getProductLocationStatus,
} from '../../utils/validationHelpers';

type UserCtx = { id: string; isAdmin: boolean };

// States that can still be cancelled.
// DRAFT is excluded: a DRAFT request must be deleted (DELETE /:id), not cancelled.
// REJECTED and FINALIZED are terminal — they cannot be cancelled.
const CANCELLABLE_STATUSES: TransferRequestStatus[] = [
  TransferRequestStatus.SUBMITTED,
  TransferRequestStatus.ORIGIN_MANAGER_APPROVED,
  TransferRequestStatus.READY_TO_FINALIZE,
];

// States from which a rejection is allowed
const REJECTABLE_STATUSES: TransferRequestStatus[] = [
  TransferRequestStatus.SUBMITTED,
  TransferRequestStatus.ORIGIN_MANAGER_APPROVED,
];

// States that have active stock reservations
const RESERVED_STATUSES: TransferRequestStatus[] = [
  TransferRequestStatus.ORIGIN_MANAGER_APPROVED,
  TransferRequestStatus.READY_TO_FINALIZE,
];

export class TransferService {
  // -------------------------------------------------------------------------
  // Request Number Generator: TRF-YYYYMMDD-SRCCODE-DSTCODE-XXXX
  // -------------------------------------------------------------------------
  private async generateRequestNumber(sourceCode: string, destCode: string): Promise<string> {
    const now    = new Date();
    const y      = now.getFullYear();
    const m      = String(now.getMonth() + 1).padStart(2, '0');
    const d      = String(now.getDate()).padStart(2, '0');
    const prefix = `TRF-${y}${m}${d}-${sourceCode}-${destCode}-`;

    const count = await transferRepository.countByDatePrefix(prefix);
    const seq   = String(count + 1).padStart(4, '0');
    return `${prefix}${seq}`;
  }

  // -------------------------------------------------------------------------
  // List transfers — non-admins only see requests for their locations
  // -------------------------------------------------------------------------
  async findAll(params: {
    status?: TransferRequestStatus;
    startDate?: Date;
    endDate?: Date;
    page: number;
    limit: number;
    user: UserCtx;
    filterLocationId?: string;
  }): Promise<{ data: TransferRequestRow[]; total: number }> {
    let locationIds: string[] | undefined;
    if (!params.user.isAdmin) {
      const roles = await prisma.userLocationRole.findMany({ where: { userId: params.user.id } });
      locationIds = roles.map((r) => r.locationId);
    }
    const { user: _user, ...rest } = params;
    return transferRepository.findAll({ ...rest, locationIds });
  }

  // -------------------------------------------------------------------------
  // Get by id — enriches items with isActiveNow for non-terminal requests
  // -------------------------------------------------------------------------
  async findById(id: string): Promise<TransferRequestRow> {
    const req = await transferRepository.findById(id);
    if (!req) throw new NotFoundError(`Stock transfer request not found: ${id}`);

    const TERMINAL: TransferRequestStatus[] = [
      TransferRequestStatus.FINALIZED,
      TransferRequestStatus.CANCELLED,
      TransferRequestStatus.REJECTED,
    ];
    if (!TERMINAL.includes(req.status) && req.items?.length) {
      const enriched = await Promise.all(
        req.items.map(async (item) => {
          const result = await validateProductActive(item.productId, req.sourceLocationId);
          return { ...item, isActiveNow: result.valid };
        }),
      );
      return { ...req, items: enriched };
    }

    return req;
  }

  // -------------------------------------------------------------------------
  // Create DRAFT request
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

    // Stage 8.1: Non-blocking validation warnings (DO NOT block execution)
    const [srcActiveResult, dstActiveResult, userAccessResult] = await Promise.all([
      validateLocationActive(dto.sourceLocationId),
      validateLocationActive(dto.destinationLocationId),
      validateUserAccess(user.id, dto.sourceLocationId),
    ]);
    if (!srcActiveResult.valid) {
      logger.warn('[Stage8] Transfer create validation warning', { check: 'sourceLocation', ...srcActiveResult });
    }
    if (!dstActiveResult.valid) {
      logger.warn('[Stage8] Transfer create validation warning', { check: 'destinationLocation', ...dstActiveResult });
    }
    if (!userAccessResult.valid) {
      logger.warn('[Stage8] Transfer create validation warning', { check: 'userAccess', userId: user.id, locationId: dto.sourceLocationId, ...userAccessResult });
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const requestNumber = await this.generateRequestNumber(source.code, dest.code);
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
    if (req.createdById !== user.id) {
      throw new ForbiddenError('Only the creator can delete a transfer request');
    }
    await transferRepository.deleteById(requestId);
  }

  // -------------------------------------------------------------------------
  // Add item (DRAFT only)
  // -------------------------------------------------------------------------
  async addItem(requestId: string, dto: AddItemDto, user: UserCtx): Promise<TransferItemRow> {
    const req = await this.findById(requestId);
    if (req.status !== TransferRequestStatus.DRAFT) {
      throw new ValidationError('Items can only be added when the request is in DRAFT status');
    }
    if (req.createdById !== user.id) {
      throw new ForbiddenError('Only the creator can modify a draft transfer request');
    }
    await assertUserCanAccessLocation(user.id, user.isAdmin, req.sourceLocationId);

    const product = await prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) throw new NotFoundError(`Product not found: ${dto.productId}`);

    // Stage 8.2: Hard-blocking product-location validation
    const productActiveResult = await validateProductActive(dto.productId, req.sourceLocationId);
    if (!productActiveResult.valid) {
      logger.info('[Stage8] Transfer addItem blocked — product not registered/active', { check: 'productActive', productId: dto.productId, locationId: req.sourceLocationId, ...productActiveResult });
      throw new ValidationError(`Product is not registered or not active at source location: ${dto.productId}`);
    }

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
    if (req.createdById !== user.id) {
      throw new ForbiddenError('Only the creator can modify a draft transfer request');
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
    if (req.createdById !== user.id) {
      throw new ForbiddenError('Only the creator can modify a draft transfer request');
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
  // -------------------------------------------------------------------------
  async submit(requestId: string, user: UserCtx): Promise<TransferRequestRow> {
    const req = await this.findById(requestId);
    if (req.status !== TransferRequestStatus.DRAFT) {
      throw new ValidationError(`Cannot submit a request with status ${req.status}`);
    }
    if (req.createdById !== user.id) {
      throw new ForbiddenError('Only the creator can submit this request');
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
  //
  // ATOMIC: status update + stock reservation in ONE transaction.
  // If reservation fails (insufficient stock), the status update is rolled back.
  // Race condition protection: status update uses WHERE status=SUBMITTED so only
  // one concurrent caller can succeed.
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
      const role = await prisma.userLocationRole.findFirst({
        where: { userId: user.id, locationId: req.sourceLocationId, role: Role.MANAGER },
      });
      if (!role) {
        throw new ForbiddenError('Only a manager at the source location can approve at origin');
      }
    }

    const now = new Date();

    // ONE transaction: status update + reservation creation.
    // If reserveStockWithinTx throws (e.g. insufficient stock), the updateMany
    // is automatically rolled back — status stays SUBMITTED.
    await prisma.$transaction(async (tx) => {
      const result = await (tx as any).stockTransferRequest.updateMany({
        where: { id: requestId, status: TransferRequestStatus.SUBMITTED },
        data:  {
          status:             TransferRequestStatus.ORIGIN_MANAGER_APPROVED,
          originApprovedById: user.id,
          originApprovedAt:   now,
        },
      });

      if (result.count === 0) {
        throw new ValidationError(
          `Cannot approve origin for a request with status ${req.status}`,
        );
      }

      // Reserve stock for all items at the source location.
      // If any item has insufficient available stock, the entire transaction
      // (including the status update) is rolled back.
      await reservationService.reserveStockWithinTx(tx, {
        sourceType: ReservationSourceType.TRANSFER,
        sourceId:   requestId,
        items: req.items.map((item) => ({
          productId:    item.productId,
          locationId:   req.sourceLocationId,
          qty:          Number(item.qty),
          sourceItemId: item.id,
        })),
      });
    });

    // Stage 8.2.1.1: non-blocking warning for now-inactive items at origin approval
    const inactiveAtOrigin = req.items.filter((i) => (i as any).isActiveNow === false);
    if (inactiveAtOrigin.length > 0) {
      logger.warn('[Stage8] Transfer approveOrigin — some items now inactive at source', {
        requestId,
        inactiveProductIds: inactiveAtOrigin.map((i) => i.productId),
      });
    }
    const originPlStatuses = await Promise.all(req.items.map((i) => getProductLocationStatus(i.productId, req.sourceLocationId)));
    const originItemSnapshot = req.items.map((i, idx) => ({ productId: i.productId, ...originPlStatuses[idx] }));
    void auditService.log({
      entityType:  'STOCK_TRANSFER_REQUEST',
      entityId:    requestId,
      action:      'STATUS_CHANGE',
      afterValue:  { status: 'ORIGIN_MANAGER_APPROVED', itemSnapshot: originItemSnapshot, inactiveItemCount: inactiveAtOrigin.length },
      performedBy: user.id,
    });

    return (await transferRepository.findById(requestId))!;
  }

  // -------------------------------------------------------------------------
  // Approve Destination (ORIGIN_MANAGER_APPROVED → READY_TO_FINALIZE)
  // No reservation changes — stock was reserved at origin approval.
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
  // Reject (SUBMITTED or ORIGIN_MANAGER_APPROVED → REJECTED)
  //
  // ATOMIC when rejecting from ORIGIN_MANAGER_APPROVED: status update +
  // reservation release in ONE transaction so reservedQty is never left
  // inflated if the status update succeeds but the release fails.
  // -------------------------------------------------------------------------
  async reject(requestId: string, user: UserCtx, reason: string): Promise<TransferRequestRow> {
    if (!reason || !reason.trim()) {
      throw new ValidationError('A rejection reason is required');
    }

    const req = await this.findById(requestId);

    if (req.status === TransferRequestStatus.SUBMITTED) {
      if (!user.isAdmin) {
        const role = await prisma.userLocationRole.findFirst({
          where: { userId: user.id, locationId: req.sourceLocationId, role: Role.MANAGER },
        });
        if (!role) {
          throw new ForbiddenError('Only a manager at the source location can reject at origin stage');
        }
      }
    } else if (req.status === TransferRequestStatus.ORIGIN_MANAGER_APPROVED) {
      await assertUserCanAccessLocation(user.id, user.isAdmin, req.destinationLocationId);
    } else {
      throw new ValidationError(`Cannot reject a request with status ${req.status}`);
    }

    const hadReservations = RESERVED_STATUSES.includes(req.status);
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      const result = await (tx as any).stockTransferRequest.updateMany({
        where: { id: requestId, status: { in: REJECTABLE_STATUSES } },
        data:  {
          status:          TransferRequestStatus.REJECTED,
          rejectedById:    user.id,
          rejectedAt:      now,
          rejectionReason: reason.trim(),
        },
      });

      if (result.count === 0) {
        throw new ValidationError(`Cannot reject a request with status ${req.status}`);
      }

      if (hadReservations) {
        await reservationService.releaseReservationWithinTx(tx, {
          sourceType: ReservationSourceType.TRANSFER,
          sourceId:   requestId,
        });
      }
    });

    void auditService.log({
      entityType:  'STOCK_TRANSFER_REQUEST',
      entityId:    requestId,
      action:      'STATUS_CHANGE',
      afterValue:  { status: 'REJECTED', rejectedFrom: req.status },
      performedBy: user.id,
    });

    return (await transferRepository.findById(requestId))!;
  }

  // -------------------------------------------------------------------------
  // Finalize (READY_TO_FINALIZE → FINALIZED)
  //
  // ATOMIC: status update + consume reservations + stock mutations in ONE
  // transaction. If any step fails the entire operation is rolled back —
  // status stays READY_TO_FINALIZE and stock is unchanged.
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

    await assertUserCanAccessLocation(user.id, user.isAdmin, req.destinationLocationId);

    // Stage 8.2.1.1: validate all items are registered at destination (blocking)
    const destStatuses = await Promise.all(
      req.items.map((item) => validateProductActive(item.productId, req.destinationLocationId)),
    );
    const notAtDest = req.items.filter((_, idx) => !destStatuses[idx].valid);
    if (notAtDest.length > 0) {
      throw new ValidationError(
        `Products not registered at destination location: ${notAtDest.map((i) => i.productId).join(', ')}`,
      );
    }

    // Stage 8.2.1.1: non-blocking warning for now-inactive items at source
    const inactiveAtFinalize = req.items.filter((i) => (i as any).isActiveNow === false);
    if (inactiveAtFinalize.length > 0) {
      logger.warn('[Stage8] Transfer finalize — some items now inactive at source', {
        requestId,
        inactiveProductIds: inactiveAtFinalize.map((i) => i.productId),
      });
    }

    const now = new Date();

    // ONE transaction: status claim + consume reservations + stock mutations.
    // consumeTransferReservationWithinTx throws if no ACTIVE reservations exist,
    // which rolls back the status update too — preventing stuck FINALIZED state.
    await prisma.$transaction(async (tx) => {
      const result = await (tx as any).stockTransferRequest.updateMany({
        where: { id: requestId, status: TransferRequestStatus.READY_TO_FINALIZE },
        data:  { status: TransferRequestStatus.FINALIZED, finalizedAt: now },
      });

      if (result.count === 0) {
        throw new ValidationError(`Cannot finalize a request with status ${req.status}`);
      }

      await reservationService.consumeTransferReservationWithinTx(tx, {
        sourceId:              requestId,
        sourceLocationId:      req.sourceLocationId,
        destinationLocationId: req.destinationLocationId,
      });
    });

    // Build snapshot: isActiveNow = source status, isRegisteredNow = destination status
    const finalizeSrcStatuses  = await Promise.all(req.items.map((i) => getProductLocationStatus(i.productId, req.sourceLocationId)));
    const finalizeDestStatuses = await Promise.all(req.items.map((i) => getProductLocationStatus(i.productId, req.destinationLocationId)));
    const finalizeItemSnapshot = req.items.map((i, idx) => ({
      productId:          i.productId,
      isActiveNow:        finalizeSrcStatuses[idx].isActiveNow,
      isRegisteredNow:    finalizeDestStatuses[idx].isRegisteredNow,
    }));
    void auditService.log({
      entityType:  'STOCK_TRANSFER_REQUEST',
      entityId:    requestId,
      action:      'STATUS_CHANGE',
      afterValue:  { status: 'FINALIZED', itemSnapshot: finalizeItemSnapshot, inactiveItemCount: inactiveAtFinalize.length },
      performedBy: user.id,
    });

    return (await transferRepository.findById(requestId))!;
  }

  // -------------------------------------------------------------------------
  // Cancel (any pre-finalized state → CANCELLED)
  //
  // ATOMIC when cancelling from a reserved state: status update + reservation
  // release in ONE transaction.
  // -------------------------------------------------------------------------
  async cancel(requestId: string, user: UserCtx, reason: string): Promise<TransferRequestRow> {
    if (!reason || !reason.trim()) {
      throw new ValidationError('A cancellation reason is required');
    }
    const req = await this.findById(requestId);

    if (!CANCELLABLE_STATUSES.includes(req.status)) {
      throw new ValidationError(`Cannot cancel a request with status ${req.status}`);
    }
    if (!user.isAdmin && req.createdById !== user.id) {
      const locRole = await prisma.userLocationRole.findFirst({
        where: {
          userId: user.id,
          locationId: { in: [req.sourceLocationId, req.destinationLocationId] },
        },
      });
      if (!locRole) {
        throw new ForbiddenError('Only the creator, a location participant, or an admin can cancel a transfer request');
      }
    }

    const hadReservations = RESERVED_STATUSES.includes(req.status);
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      const result = await (tx as any).stockTransferRequest.updateMany({
        where: { id: requestId, status: { in: CANCELLABLE_STATUSES } },
        data:  {
          status:             TransferRequestStatus.CANCELLED,
          cancelledById:      user.id,
          cancelledAt:        now,
          cancellationReason: reason.trim(),
        },
      });

      if (result.count === 0) {
        throw new ValidationError(`Cannot cancel a request with status ${req.status}`);
      }

      if (hadReservations) {
        await reservationService.releaseReservationWithinTx(tx, {
          sourceType: ReservationSourceType.TRANSFER,
          sourceId:   requestId,
        });
      }
    });

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
