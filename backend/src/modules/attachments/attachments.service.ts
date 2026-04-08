import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Attachment } from '@prisma/client';
import { AttachmentRepository, attachmentRepository } from './repositories/attachment.repository';
import { auditService } from '../../services/audit.service';
import { NotFoundError, ValidationError } from '../../utils/errors';
import prisma from '../../config/database';

export type EntityType = 'ADJUSTMENT' | 'TRANSFER';

const ALLOWED_ENTITY_TYPES: EntityType[] = ['ADJUSTMENT', 'TRANSFER'];

function assertEntityType(entityType: string): asserts entityType is EntityType {
  if (!ALLOWED_ENTITY_TYPES.includes(entityType as EntityType)) {
    throw new ValidationError('Invalid entity type');
  }
}

export class AttachmentsService {
  constructor(private readonly repo: AttachmentRepository) {}

  async uploadAttachment(
    entityType: EntityType,
    entityId: string,
    file: Express.Multer.File | undefined,
    userId: string,
  ): Promise<Attachment> {
    assertEntityType(entityType);

    if (!file) {
      throw new ValidationError('No file uploaded');
    }

    const dir = path.resolve('uploads', entityType, entityId);
    fs.mkdirSync(dir, { recursive: true });

    const fileName = `${crypto.randomUUID()}-${file.originalname}`;
    const filePath = path.join(dir, fileName);
    fs.writeFileSync(filePath, file.buffer);
    console.log('Attachment saved to:', filePath);

    const attachment = await this.repo.create({
      entityType,
      entityId,
      fileName: file.originalname,
      filePath,
      mimeType: file.mimetype,
      fileSize: file.size,
      uploadedBy: userId,
    });

    await auditService.log({
      userId,
      action: 'ATTACHMENT_UPLOAD',
      entityType: 'ATTACHMENT',
      entityId: attachment.id,
      afterSnapshot: { entityType, entityId, fileName: file.originalname },
    });

    return attachment;
  }

  async getAttachments(entityType: EntityType, entityId: string): Promise<Attachment[]> {
    assertEntityType(entityType);
    return this.repo.findByEntity(entityType, entityId);
  }

  async deleteAttachment(id: string, userId: string): Promise<void> {
    const attachment = await this.repo.findById(id);
    if (!attachment) {
      throw new NotFoundError('Attachment not found');
    }

    const status = await this.getEntityStatus(
      attachment.entityType as EntityType,
      attachment.entityId,
    );

    if (status !== 'DRAFT') {
      throw new ValidationError('Cannot delete attachment after submission');
    }

    if (fs.existsSync(attachment.filePath)) {
      fs.unlinkSync(attachment.filePath);
    }

    await this.repo.delete(id);

    await auditService.log({
      userId,
      action: 'ATTACHMENT_DELETE',
      entityType: 'ATTACHMENT',
      entityId: id,
      beforeSnapshot: {
        entityType: attachment.entityType,
        entityId: attachment.entityId,
        fileName: attachment.fileName,
      },
    });
  }

  async getAttachmentFile(id: string): Promise<Attachment> {
    const attachment = await this.repo.findById(id);
    if (!attachment) {
      throw new NotFoundError('Attachment not found');
    }

    console.log('Downloading file from:', attachment.filePath);

    if (!fs.existsSync(attachment.filePath)) {
      throw new NotFoundError('File not found on server');
    }

    return attachment;
  }

  private async getEntityStatus(entityType: EntityType, entityId: string): Promise<string> {
    if (entityType === 'ADJUSTMENT') {
      const request = await prisma.stockAdjustmentRequest.findUnique({
        where: { id: entityId },
        select: { status: true },
      });
      if (!request) throw new NotFoundError('Adjustment request not found');
      return request.status;
    }

    if (entityType === 'TRANSFER') {
      const request = await prisma.stockTransferRequest.findUnique({
        where: { id: entityId },
        select: { status: true },
      });
      if (!request) throw new NotFoundError('Transfer request not found');
      return request.status;
    }

    throw new ValidationError(`Unknown entity type: ${entityType}`);
  }
}

export const attachmentsService = new AttachmentsService(attachmentRepository);
