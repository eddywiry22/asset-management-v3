import { TransferRequestStatus } from '@prisma/client';
import {
  transferRepository,
  TransferRequestRow,
  TransferItemRow,
} from './transfer.repository';
import { stockService } from '../stock/stock.service';
import { NotFoundError, ValidationError } from '../../utils/errors';
import { CreateTransferDto, AddItemDto, UpdateItemDto } from './transfer.validator';
import { auditService } from '../../services/audit.service';
import prisma from '../../config/database';

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
  // Create DRAFT request  (retry on unique constraint collision)
  // -------------------------------------------------------------------------
  async create(dto: CreateTransferDto, userId: string): Promise<TransferRequestRow> {
    if (dto.sourceLocationId === dto.destinationLocationId) {
      throw new ValidationError('Source and destination locations must be different');
    }

    const source = await prisma.location.findUnique({ where: { id: dto.sourceLocationId } });
    if (!source) throw new NotFoundError(`Source location not found: ${dto.sourceLocationId}`);

    const dest = await prisma.location.findUnique({ where: { id: dto.destinationLocationId } });
    if (!dest) throw new NotFoundError(`Destination location not found: ${dto.destinationLocationId}`);

    for (let attempt = 0; attempt < 5; attempt++) {
      const requestNumber = await this.generateRequestNumber();
      try {
        return await transferRepository.create({
          requestNumber,
          sourceLocationId:      dto.sourceLocationId,
          destinationLocationId: dto.destinationLocationId,
          createdById:           userId,
          notes:                 dto.notes,
        });
      } catch (err: any) {
        if (err?.code === 'P2002' && attempt < 4) continue; // unique collision — retry
        throw err;
      }
    }
    throw new ValidationError('Unable to generate a unique request number');
  }

  // -------------------------------------------------------------------------
  // Add item (DRAFT only)
  // -------------------------------------------------------------------------
  async addItem(requestId: string, dto: AddItemDto): Promise<TransferItemRow> {
    const req = await this.findById(requestId);
    if (req.status !== TransferRequestStatus.DRAFT) {
      throw new ValidationError('Items can only be added when the request is in DRAFT status');
    }
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
  async updateItem(requestId: string, itemId: string, dto: UpdateItemDto): Promise<TransferItemRow> {
    const req = await this.findById(requestId);
    if (req.status !== TransferRequestStatus.DRAFT) {
      throw new ValidationError('Items can only be edited when the request is in DRAFT status');
    }
    const item = await transferRepository.findItemById(itemId);
    if (!item || item.requestId !== requestId) {
      throw new NotFoundError(`Item not found: ${itemId}`);
    }
    return transferRepository.updateItem(itemId, dto.qty);
  }

  // -------------------------------------------------------------------------
  // Delete item (DRAFT only)
  // -------------------------------------------------------------------------
  async deleteItem(requestId: string, itemId: string): Promise<void> {
    const req = await this.findById(requestId);
    if (req.status !== TransferRequestStatus.DRAFT) {
      throw new ValidationError('Items can only be deleted when the request is in DRAFT status');
    }
    const item = await transferRepository.findItemById(itemId);
    if (!item || item.requestId !== requestId) {
      throw new NotFoundError(`Item not found: ${itemId}`);
    }
    await transferRepository.deleteItem(itemId);
  }

  // -------------------------------------------------------------------------
  // Finalize (DRAFT → FINALIZED)  (C1: optimistic concurrency)
  // -------------------------------------------------------------------------
  async finalize(requestId: string, userId: string): Promise<TransferRequestRow> {
    const req = await this.findById(requestId);

    if (req.status !== TransferRequestStatus.DRAFT) {
      throw new ValidationError(`Cannot finalize a request with status ${req.status}`);
    }
    if (!req.items || req.items.length === 0) {
      throw new ValidationError('Cannot finalize a transfer with no items');
    }
    if (req.sourceLocationId === req.destinationLocationId) {
      throw new ValidationError('Source and destination locations must be different');
    }

    // Atomically claim: only the first concurrent caller transitions DRAFT → FINALIZED.
    const claimed = await transferRepository.claimFinalization(requestId, new Date());
    if (!claimed) {
      throw new ValidationError(`Cannot finalize a request with status ${req.status}`);
    }

    // Apply stock moves (each call is internally transactional).
    for (const item of req.items) {
      await stockService.moveStock({
        productId:            item.productId,
        sourceLocationId:     req.sourceLocationId,
        destinationLocationId: req.destinationLocationId,
        qty:                  Number(item.qty),
        sourceId:             requestId,
      });
    }

    void auditService.log({
      entityType:  'STOCK_TRANSFER_REQUEST',
      entityId:    requestId,
      action:      'STATUS_CHANGE',
      afterValue:  { status: 'FINALIZED' },
      performedBy: userId,
    });

    return (await transferRepository.findById(requestId))!;
  }
}

export const transferService = new TransferService();
