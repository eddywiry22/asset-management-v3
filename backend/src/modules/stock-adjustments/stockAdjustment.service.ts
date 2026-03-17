import { AdjustmentRequestStatus, Role } from '@prisma/client';
import {
  stockAdjustmentRepository,
  AdjustmentRequestRow,
  AdjustmentItemRow,
} from './stockAdjustment.repository';
import { stockService } from '../stock/stock.service';
import { NotFoundError, ValidationError, ForbiddenError } from '../../utils/errors';
import { assertUserCanAccessLocation } from '../../utils/guards';
import { CreateRequestDto, AddItemDto, UpdateItemDto } from './stockAdjustment.validator';
import { auditService } from '../../services/audit.service';
import prisma from '../../config/database';

type UserCtx = { id: string; isAdmin: boolean };

export class StockAdjustmentService {
  // -------------------------------------------------------------------------
  // Request Number Generator: ADJ-YYYYMMDD-LOCCODE-XXXX  (C2: retry on collision)
  // -------------------------------------------------------------------------
  private async generateRequestNumber(locationCode: string): Promise<string> {
    const now    = new Date();
    const y      = now.getFullYear();
    const m      = String(now.getMonth() + 1).padStart(2, '0');
    const d      = String(now.getDate()).padStart(2, '0');
    const prefix = `ADJ-${y}${m}${d}-${locationCode}-`;

    const count = await stockAdjustmentRepository.countByDatePrefix(prefix);
    const seq   = String(count + 1).padStart(4, '0');
    return `${prefix}${seq}`;
  }

  // -------------------------------------------------------------------------
  // List requests — non-admins only see requests touching their locations
  // -------------------------------------------------------------------------
  async findAll(params: {
    status?: AdjustmentRequestStatus;
    startDate?: Date;
    endDate?: Date;
    page: number;
    limit: number;
    user: UserCtx;
    filterLocationId?: string;
  }): Promise<{ data: AdjustmentRequestRow[]; total: number }> {
    let locationIds: string[] | undefined;
    if (!params.user.isAdmin) {
      const roles = await prisma.userLocationRole.findMany({ where: { userId: params.user.id } });
      locationIds = roles.map((r) => r.locationId);
    }
    const { user: _user, ...rest } = params;
    return stockAdjustmentRepository.findAll({ ...rest, locationIds });
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
    // Resolve location code for request number prefix
    const locationRole = await prisma.userLocationRole.findFirst({
      where:   { userId },
      include: { location: { select: { code: true } } },
    });
    const locationCode = locationRole?.location?.code ?? 'GEN';

    for (let attempt = 0; attempt < 5; attempt++) {
      const requestNumber = await this.generateRequestNumber(locationCode);
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
  // Add item (DRAFT only) — Part 1: guard by item locationId
  // -------------------------------------------------------------------------
  async addItem(requestId: string, dto: AddItemDto, user: UserCtx): Promise<AdjustmentItemRow> {
    const req = await this.findById(requestId);
    if (req.status !== AdjustmentRequestStatus.DRAFT) {
      throw new ValidationError('Items can only be added when the request is in DRAFT status');
    }
    if (req.createdById !== user.id) {
      throw new ForbiddenError('Only the creator can modify a draft adjustment request');
    }
    // Guard: user must have access to the target location
    await assertUserCanAccessLocation(user.id, user.isAdmin, dto.locationId);

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
  // Update item (DRAFT only) — Part 1: guard by item locationId
  // -------------------------------------------------------------------------
  async updateItem(requestId: string, itemId: string, dto: UpdateItemDto, user: UserCtx): Promise<AdjustmentItemRow> {
    const req  = await this.findById(requestId);
    if (req.status !== AdjustmentRequestStatus.DRAFT) {
      throw new ValidationError('Items can only be edited when the request is in DRAFT status');
    }
    if (req.createdById !== user.id) {
      throw new ForbiddenError('Only the creator can modify a draft adjustment request');
    }
    const item = await stockAdjustmentRepository.findItemById(itemId);
    if (!item || item.requestId !== requestId) {
      throw new NotFoundError(`Item not found: ${itemId}`);
    }
    // Guard: user must have access to the item's location
    await assertUserCanAccessLocation(user.id, user.isAdmin, item.locationId);

    return stockAdjustmentRepository.updateItem(itemId, dto);
  }

  // -------------------------------------------------------------------------
  // Delete item (DRAFT only) — Part 1: guard by item locationId
  // -------------------------------------------------------------------------
  async deleteItem(requestId: string, itemId: string, user: UserCtx): Promise<void> {
    const req  = await this.findById(requestId);
    if (req.status !== AdjustmentRequestStatus.DRAFT) {
      throw new ValidationError('Items can only be deleted when the request is in DRAFT status');
    }
    if (req.createdById !== user.id) {
      throw new ForbiddenError('Only the creator can modify a draft adjustment request');
    }
    const item = await stockAdjustmentRepository.findItemById(itemId);
    if (!item || item.requestId !== requestId) {
      throw new NotFoundError(`Item not found: ${itemId}`);
    }
    // Guard: user must have access to the item's location
    await assertUserCanAccessLocation(user.id, user.isAdmin, item.locationId);

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
    if (req.createdById !== userId) {
      throw new ForbiddenError('Only the creator can submit this request');
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
  // Approve (SUBMITTED → APPROVED) — managers and admins only
  // Part 1: guard by any item's location
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

    // Part 1: verify user has access to at least one item's location
    if (!userRoles.isAdmin) {
      const locationIds = [...new Set(req.items.map((i) => i.locationId))];
      let hasAccess = false;
      for (const locationId of locationIds) {
        const role = await prisma.userLocationRole.findFirst({ where: { userId, locationId } });
        if (role) { hasAccess = true; break; }
      }
      if (!hasAccess) {
        throw new ForbiddenError('You do not have access to this location');
      }
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
  // Reject (SUBMITTED → REJECTED) — managers and admins only
  // Part 1: guard by any item's location
  // -------------------------------------------------------------------------
  async reject(requestId: string, userId: string, userRoles: { isAdmin: boolean; locationRoles: string[] }, reason: string): Promise<AdjustmentRequestRow> {
    if (!reason || !reason.trim()) {
      throw new ValidationError('A rejection reason is required');
    }
    if (!userRoles.isAdmin && !userRoles.locationRoles.includes(Role.MANAGER)) {
      throw new ForbiddenError('Only managers or admins can reject adjustment requests');
    }
    const req = await this.findById(requestId);
    if (req.status !== AdjustmentRequestStatus.SUBMITTED) {
      throw new ValidationError(`Cannot reject a request with status ${req.status}`);
    }

    // Part 1: verify user has access to at least one item's location
    if (!userRoles.isAdmin && req.items && req.items.length > 0) {
      const locationIds = [...new Set(req.items.map((i) => i.locationId))];
      let hasAccess = false;
      for (const locationId of locationIds) {
        const role = await prisma.userLocationRole.findFirst({ where: { userId, locationId } });
        if (role) { hasAccess = true; break; }
      }
      if (!hasAccess) {
        throw new ForbiddenError('You do not have access to this location');
      }
    }

    const claimed = await stockAdjustmentRepository.claimRejection(requestId, userId, new Date(), reason.trim());
    if (!claimed) {
      throw new ValidationError(`Cannot reject a request with status ${req.status}`);
    }
    void auditService.log({ entityType: 'STOCK_ADJUSTMENT_REQUEST', entityId: requestId, action: 'STATUS_CHANGE', afterValue: { status: 'REJECTED' }, performedBy: userId });
    return (await stockAdjustmentRepository.findById(requestId))!;
  }

  // -------------------------------------------------------------------------
  // Finalize (APPROVED → FINALIZED)  (C1: optimistic concurrency, W14: audit)
  // Part 1: guard by any item's location
  // -------------------------------------------------------------------------
  async finalize(requestId: string, userId: string, userCtx?: UserCtx): Promise<AdjustmentRequestRow> {
    const req = await this.findById(requestId);
    if (req.status !== AdjustmentRequestStatus.APPROVED) {
      throw new ValidationError(`Cannot finalize a request with status ${req.status}`);
    }

    // Part 1: if user context provided, verify location access
    if (userCtx && !userCtx.isAdmin && req.items && req.items.length > 0) {
      const locationIds = [...new Set(req.items.map((i) => i.locationId))];
      let hasAccess = false;
      for (const locationId of locationIds) {
        const role = await prisma.userLocationRole.findFirst({ where: { userId, locationId } });
        if (role) { hasAccess = true; break; }
      }
      if (!hasAccess) {
        throw new ForbiddenError('You do not have access to this location');
      }
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
  // -------------------------------------------------------------------------
  // Cancel (any pre-terminal state → CANCELLED)
  // Creator, admin, or manager at any item's location can cancel
  // -------------------------------------------------------------------------
  async cancel(requestId: string, user: UserCtx, reason: string): Promise<AdjustmentRequestRow> {
    if (!reason || !reason.trim()) {
      throw new ValidationError('A cancellation reason is required');
    }
    const req = await this.findById(requestId);

    if (req.status === AdjustmentRequestStatus.FINALIZED || req.status === AdjustmentRequestStatus.CANCELLED || req.status === AdjustmentRequestStatus.REJECTED) {
      throw new ValidationError(`Cannot cancel a request with status ${req.status}`);
    }

    if (!user.isAdmin && req.createdById !== user.id) {
      // Check if user is a manager at any item's location
      const locationIds = [...new Set(req.items.map((i) => i.locationId))];
      let hasManagerAccess = false;
      for (const locationId of locationIds) {
        const role = await prisma.userLocationRole.findFirst({
          where: { userId: user.id, locationId, role: Role.MANAGER },
        });
        if (role) { hasManagerAccess = true; break; }
      }
      if (!hasManagerAccess) {
        throw new ForbiddenError('Only the creator, a manager at the item location, or an admin can cancel this request');
      }
    }

    const claimed = await stockAdjustmentRepository.claimCancellation(
      requestId,
      user.id,
      new Date(),
      [req.status],
      reason.trim(),
    );
    if (!claimed) {
      throw new ValidationError(`Cannot cancel a request with status ${req.status}`);
    }

    void auditService.log({ entityType: 'STOCK_ADJUSTMENT_REQUEST', entityId: requestId, action: 'STATUS_CHANGE', afterValue: { status: 'CANCELLED' }, performedBy: user.id });
    return (await stockAdjustmentRepository.findById(requestId))!;
  }
}

export const stockAdjustmentService = new StockAdjustmentService();
