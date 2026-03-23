import { AdjustmentRequestStatus, Role } from '@prisma/client';
import {
  stockAdjustmentRepository,
  AdjustmentRequestRow,
  AdjustmentItemRow,
} from './stockAdjustment.repository';
import { stockService } from '../stock/stock.service';
import { reservationService } from '../stock/reservation.service';
import { NotFoundError, ValidationError, ForbiddenError } from '../../utils/errors';
import { assertUserCanAccessLocation } from '../../utils/guards';
import { CreateRequestDto, AddItemDto, UpdateItemDto } from './stockAdjustment.validator';
import { auditService } from '../../services/audit.service';
import prisma from '../../config/database';
import logger from '../../utils/logger';
import {
  validateUserAccess,
  validateLocationActive,
  validateProductActive,
  getProductLocationStatus,
} from '../../utils/validationHelpers';
import { getAdjustmentEligibleUsers } from '../stock/utils/workflowResponsibility';

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
    return stockAdjustmentRepository.findAll({ ...rest, locationIds, creatorId: params.user.id });
  }

  // -------------------------------------------------------------------------
  // Get by id — enriches items with isActiveNow for non-terminal requests
  //             and live beforeQty/afterQty for DRAFT requests
  // -------------------------------------------------------------------------
  async findById(id: string): Promise<AdjustmentRequestRow> {
    const req = await stockAdjustmentRepository.findById(id);
    if (!req) throw new NotFoundError(`Stock adjustment request not found: ${id}`);

    const TERMINAL: AdjustmentRequestStatus[] = [
      AdjustmentRequestStatus.FINALIZED,
      AdjustmentRequestStatus.CANCELLED,
      AdjustmentRequestStatus.REJECTED,
    ];
    if (!TERMINAL.includes(req.status) && req.items?.length) {
      const enriched = await Promise.all(
        req.items.map(async (item) => {
          const result = await validateProductActive(item.productId, item.locationId);
          const enrichedItem: typeof item & { isActiveNow: boolean } = { ...item, isActiveNow: result.valid };

          // For DRAFT requests: recalculate live beforeQty/afterQty from current stock balance
          if (req.status === AdjustmentRequestStatus.DRAFT) {
            const balance = await prisma.stockBalance.findUnique({
              where: { productId_locationId: { productId: item.productId, locationId: item.locationId } },
            });
            const liveBeforeQty = balance ? Number(balance.onHandQty) : 0;
            const liveAfterQty  = liveBeforeQty + Number(item.qtyChange);
            return { ...enrichedItem, beforeQty: liveBeforeQty, afterQty: liveAfterQty };
          }

          return enrichedItem;
        }),
      );
      return { ...req, items: enriched };
    }

    return req;
  }

  // -------------------------------------------------------------------------
  // Create request  (C2: retry on unique constraint collision)
  // -------------------------------------------------------------------------
  async create(dto: CreateRequestDto, userId: string): Promise<AdjustmentRequestRow> {
    // Resolve location code for request number prefix
    const locationRole = await prisma.userLocationRole.findFirst({
      where:   { userId },
      include: { location: { select: { code: true, isActive: true } } },
    });
    const locationCode = locationRole?.location?.code ?? 'GEN';

    // Stage 8.4.1: block create if user's primary location is inactive
    if (locationRole?.location?.isActive === false) {
      logger.warn('[Stage8.4] Adjustment create blocked — location inactive', { userId, locationCode });
      void auditService.log({
        entityType:    'STOCK_ADJUSTMENT_REQUEST',
        entityId:      userId,
        action:        'BLOCKED',
        afterSnapshot: { reason: 'LOCATION_INACTIVE', locationCode },
        performedBy:   userId,
      });
      throw new ValidationError(
        `Cannot create adjustment: your location ${locationCode} is inactive. Contact admin.`,
      );
    }

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
  // Delete request (DRAFT only, creator only)
  // -------------------------------------------------------------------------
  async deleteRequest(requestId: string, userId: string): Promise<void> {
    const req = await this.findById(requestId);
    if (req.status !== AdjustmentRequestStatus.DRAFT) {
      throw new ValidationError('Only DRAFT requests can be deleted');
    }
    if (req.createdById !== userId) {
      throw new ForbiddenError('Only the creator can delete this request');
    }
    await stockAdjustmentRepository.deleteById(requestId);
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

    // Stage 8.2: Hard-blocking validation (inactive product/location blocked)
    const [locationActiveResult, userAccessResult, productActiveResult] = await Promise.all([
      validateLocationActive(dto.locationId),
      validateUserAccess(user.id, dto.locationId),
      validateProductActive(dto.productId, dto.locationId),
    ]);
    if (!locationActiveResult.valid) {
      logger.info('[Stage8] Adjustment addItem blocked — location inactive', { check: 'locationActive', locationId: dto.locationId, ...locationActiveResult });
      throw new ValidationError(`Location is inactive or not found: ${dto.locationId}`);
    }
    if (!userAccessResult.valid) {
      logger.info('[Stage8] Adjustment addItem blocked — user has no access', { check: 'userAccess', userId: user.id, locationId: dto.locationId, ...userAccessResult });
    }
    if (!productActiveResult.valid) {
      // M1: missing row is treated identically to inactive (PRODUCT_INACTIVE).
      logger.info('[Stage8] Adjustment addItem blocked — product inactive at location', { check: 'productActive', productId: dto.productId, locationId: dto.locationId, ...productActiveResult });
      throw new ValidationError('Product is inactive at this location');
    }

    // Snapshot beforeQty at time of item addition; calculate afterQty
    const balance = await prisma.stockBalance.findUnique({
      where: { productId_locationId: { productId: dto.productId, locationId: dto.locationId } },
    });
    const beforeQty = balance ? Number(balance.onHandQty) : 0;
    const afterQty  = beforeQty + dto.qtyChange;

    return stockAdjustmentRepository.addItem({
      requestId,
      productId:  dto.productId,
      locationId: dto.locationId,
      qtyChange:  dto.qtyChange,
      reason:     dto.reason,
      beforeQty,
      afterQty,
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

    // If qtyChange or locationId is being updated, refresh beforeQty/afterQty snapshot
    const newLocationId = dto.locationId ?? item.locationId;
    const newQtyChange  = dto.qtyChange  ?? Number(item.qtyChange);
    const balance = await prisma.stockBalance.findUnique({
      where: { productId_locationId: { productId: item.productId, locationId: newLocationId } },
    });
    const beforeQty = balance ? Number(balance.onHandQty) : 0;
    const afterQty  = beforeQty + newQtyChange;

    return stockAdjustmentRepository.updateItem(itemId, { ...dto, beforeQty, afterQty });
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

    // Stage 8.6: warn (non-blocking) if no MANAGER exists to approve at item location(s)
    const submitEligible = await getAdjustmentEligibleUsers(prisma, { status: 'SUBMITTED', items: req.items });
    if (submitEligible.length === 0) {
      logger.warn('[Stage8.6] Adjustment submit warning — no managers at item location(s) to approve', { requestId });
    }

    void auditService.log({ entityType: 'STOCK_ADJUSTMENT_REQUEST', entityId: requestId, action: 'STATUS_CHANGE', beforeValue: { status: 'DRAFT' }, afterValue: { status: 'SUBMITTED' }, performedBy: userId });
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

    // Stage 8.4.1: block if any item location is inactive
    const adjApproveLocIds = [...new Set(req.items.map((i) => i.locationId))];
    const adjApproveInactiveLocs: string[] = [];
    for (const locId of adjApproveLocIds) {
      const result = await validateLocationActive(locId);
      if (!result.valid) {
        const loc = await prisma.location.findUnique({ where: { id: locId }, select: { code: true } });
        adjApproveInactiveLocs.push(loc?.code ?? locId);
      }
    }
    if (adjApproveInactiveLocs.length > 0) {
      logger.warn('[Stage8.4] Adjustment approve blocked — inactive location(s)', { requestId, adjApproveInactiveLocs });
      void auditService.log({
        entityType:    'STOCK_ADJUSTMENT_REQUEST',
        entityId:      requestId,
        action:        'BLOCKED',
        afterSnapshot: { reason: 'LOCATION_INACTIVE', inactiveLocations: adjApproveInactiveLocs },
        performedBy:   userId,
      });
      throw new ValidationError(
        `Cannot approve: location(s) ${adjApproveInactiveLocs.join(', ')} are inactive. Reactivate them first.`,
      );
    }

    // Stage 8.2.1.1: non-blocking warning for now-inactive items
    const inactiveItems = req.items.filter((i) => (i as any).isActiveNow === false);
    if (inactiveItems.length > 0) {
      logger.warn('[Stage8] Adjustment approve — some items now inactive', {
        requestId,
        inactiveProductIds: inactiveItems.map((i) => i.productId),
      });
    }

    // Hard pre-flight: outbound items must not exceed available stock
    // (availableQty accounts for ACTIVE reservations from other requests).
    for (const item of req.items) {
      const qtyChange = Number(item.qtyChange);
      if (qtyChange < 0) {
        const { availableQty } = await reservationService.getAvailableStock(
          item.productId,
          item.locationId,
        );
        if (availableQty + qtyChange < 0) {
          throw new ValidationError(
            `Insufficient available stock for product ${item.productId} at location ${item.locationId}. ` +
            `Available: ${availableQty}, requested change: ${qtyChange}`,
          );
        }
      }
    }

    const updated = await stockAdjustmentRepository.updateStatus(requestId, {
      status:      AdjustmentRequestStatus.APPROVED,
      approvedById: userId,
      approvedAt:   new Date(),
    });
    const plStatuses = await Promise.all(req.items.map((i) => getProductLocationStatus(i.productId, i.locationId)));
    const itemSnapshot = req.items.map((i, idx) => ({ productId: i.productId, locationId: i.locationId, ...plStatuses[idx] }));
    void auditService.log({ entityType: 'STOCK_ADJUSTMENT_REQUEST', entityId: requestId, action: 'STATUS_CHANGE', beforeValue: { status: 'SUBMITTED' }, afterValue: { status: 'APPROVED', itemSnapshot, inactiveItemCount: inactiveItems.length }, performedBy: userId });
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
    void auditService.log({ entityType: 'STOCK_ADJUSTMENT_REQUEST', entityId: requestId, action: 'STATUS_CHANGE', beforeValue: { status: 'SUBMITTED' }, afterValue: { status: 'REJECTED' }, performedBy: userId });
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

    // Stage 8.4.1: block if any item location is inactive
    const adjFinalizeLocIds = [...new Set(req.items.map((i) => i.locationId))];
    const adjFinalizeInactiveLocs: string[] = [];
    for (const locId of adjFinalizeLocIds) {
      const result = await validateLocationActive(locId);
      if (!result.valid) {
        const loc = await prisma.location.findUnique({ where: { id: locId }, select: { code: true } });
        adjFinalizeInactiveLocs.push(loc?.code ?? locId);
      }
    }
    if (adjFinalizeInactiveLocs.length > 0) {
      logger.warn('[Stage8.4] Adjustment finalize blocked — inactive location(s)', { requestId, adjFinalizeInactiveLocs });
      void auditService.log({
        entityType:    'STOCK_ADJUSTMENT_REQUEST',
        entityId:      requestId,
        action:        'BLOCKED',
        afterSnapshot: { reason: 'LOCATION_INACTIVE', inactiveLocations: adjFinalizeInactiveLocs },
        performedBy:   userId,
      });
      throw new ValidationError(
        `Cannot finalize: location(s) ${adjFinalizeInactiveLocs.join(', ')} are inactive. Reactivate them first.`,
      );
    }

    // Stage 8.6: HARD BLOCK — item location(s) must have eligible users to finalize
    const finalizeEligible = await getAdjustmentEligibleUsers(prisma, { status: 'APPROVED', items: req.items });
    if (finalizeEligible.length === 0) {
      logger.warn('[Stage8.6] Adjustment finalize blocked — no eligible users at item location(s)', { requestId });
      void auditService.log({
        entityType:    'STOCK_ADJUSTMENT_REQUEST',
        entityId:      requestId,
        action:        'BLOCKED',
        afterSnapshot: { reason: 'NO_ELIGIBLE_USERS_TO_FINALIZE' },
        performedBy:   userId,
      });
      throw new ValidationError(
        'Cannot finalize adjustment: no eligible users (OPERATOR or MANAGER) at the item location(s) to complete the workflow',
      );
    }

    // Stage 8.2.2: blocking check — reject finalize if any items are now inactive
    const inactiveAtFinalize = req.items.filter((i) => (i as any).isActiveNow === false);
    if (inactiveAtFinalize.length > 0) {
      logger.warn('[Stage8] Adjustment finalize blocked — inactive items', {
        requestId,
        inactiveProductIds: inactiveAtFinalize.map((i) => i.productId),
      });
      void auditService.log({
        entityType: 'STOCK_ADJUSTMENT_REQUEST',
        entityId:   requestId,
        action:     'FINALIZE_BLOCKED',
        afterValue: {
          reason:             'INACTIVE_ITEMS',
          inactiveProductIds: inactiveAtFinalize.map((i) => i.productId),
          inactiveItemCount:  inactiveAtFinalize.length,
        },
        performedBy: userId,
      });
      throw new ValidationError(
        `Cannot finalize: ${inactiveAtFinalize.length} item(s) have inactive product registrations. ` +
        `Reactivate or remove the inactive items before finalizing.`,
      );
    }

    // ONE transaction: status claim + all stock mutations.
    // applyAdjustmentTx checks available stock with row-level locking inside
    // the transaction — if any item has insufficient stock, the entire
    // transaction rolls back (status stays APPROVED, no partial mutations).
    await prisma.$transaction(async (tx) => {
      const result = await (tx as any).stockAdjustmentRequest.updateMany({
        where: { id: requestId, status: AdjustmentRequestStatus.APPROVED },
        data:  { status: AdjustmentRequestStatus.FINALIZED, finalizedById: userId, finalizedAt: new Date() },
      });

      if (result.count === 0) {
        throw new ValidationError(`Cannot finalize a request with status ${req.status}`);
      }

      for (const item of req.items) {
        await stockService.applyAdjustmentTx(tx as any, {
          productId:  item.productId,
          locationId: item.locationId,
          qtyChange:  Number(item.qtyChange),
          sourceId:   requestId,
        });
      }
    });

    const finalizePlStatuses = await Promise.all(req.items.map((i) => getProductLocationStatus(i.productId, i.locationId)));
    const finalizeItemSnapshot = req.items.map((i, idx) => ({ productId: i.productId, locationId: i.locationId, ...finalizePlStatuses[idx] }));
    void auditService.log({ entityType: 'STOCK_ADJUSTMENT_REQUEST', entityId: requestId, action: 'STATUS_CHANGE', beforeValue: { status: 'APPROVED' }, afterValue: { status: 'FINALIZED', itemSnapshot: finalizeItemSnapshot }, performedBy: userId });
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

    void auditService.log({ entityType: 'STOCK_ADJUSTMENT_REQUEST', entityId: requestId, action: 'STATUS_CHANGE', beforeValue: { status: req.status }, afterValue: { status: 'CANCELLED' }, performedBy: user.id });
    return (await stockAdjustmentRepository.findById(requestId))!;
  }
}

export const stockAdjustmentService = new StockAdjustmentService();
