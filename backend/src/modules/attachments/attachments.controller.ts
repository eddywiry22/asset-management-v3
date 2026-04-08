import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../../types/request.types';
import { AttachmentsService, attachmentsService, EntityType } from './attachments.service';
import { ValidationError } from '../../utils/errors';

const VALID_ENTITY_TYPES: EntityType[] = ['ADJUSTMENT', 'TRANSFER'];

function assertValidEntityType(entityType: string): asserts entityType is EntityType {
  if (!VALID_ENTITY_TYPES.includes(entityType as EntityType)) {
    throw new ValidationError(`Invalid entityType: must be ADJUSTMENT or TRANSFER`);
  }
}

export class AttachmentsController {
  constructor(private readonly service: AttachmentsService) {}

  async upload(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { entityType, entityId } = req.params;
      assertValidEntityType(entityType);

      const result = await this.service.uploadAttachment(
        entityType,
        entityId,
        req.file,
        req.user.id,
      );

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  async list(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { entityType, entityId } = req.params;
      assertValidEntityType(entityType);

      const data = await this.service.getAttachments(entityType, entityId);

      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  async delete(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      await this.service.deleteAttachment(id, req.user.id);

      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }

  async download(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      const file = await this.service.getAttachmentFile(id);

      res.download(file.filePath, file.fileName, (err) => {
        if (err) {
          next(err);
        }
      });
    } catch (err) {
      next(err);
    }
  }
}

export const attachmentsController = new AttachmentsController(attachmentsService);
