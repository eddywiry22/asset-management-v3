import prisma from '../../../config/database';
import { Attachment } from '@prisma/client';

export type AttachmentWithUploader = Attachment & {
  uploadedBy: { id: string; username: string };
};

export class AttachmentRepository {
  async create(data: {
    entityType: string;
    entityId: string;
    fileName: string;
    filePath: string;
    mimeType: string;
    fileSize: number;
    description?: string | null;
    uploadedById: string;
  }): Promise<Attachment> {
    return prisma.attachment.create({ data });
  }

  async findByEntity(entityType: string, entityId: string): Promise<AttachmentWithUploader[]> {
    return prisma.attachment.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'desc' },
      include: {
        uploadedBy: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    }) as Promise<AttachmentWithUploader[]>;
  }

  async findById(id: string): Promise<Attachment | null> {
    return prisma.attachment.findUnique({ where: { id } });
  }

  async delete(id: string): Promise<void> {
    await prisma.attachment.delete({ where: { id } });
  }
}

export const attachmentRepository = new AttachmentRepository();
