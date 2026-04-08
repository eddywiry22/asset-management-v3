import prisma from '../../../config/database';
import { Comment } from '@prisma/client';

export type CommentWithAuthor = Comment & {
  createdBy: { id: string; username: string };
};

export class CommentRepository {
  async create(data: {
    entityType: string;
    entityId: string;
    message: string;
    createdById: string;
  }): Promise<Comment> {
    return prisma.comment.create({ data });
  }

  async findByEntity(entityType: string, entityId: string): Promise<CommentWithAuthor[]> {
    return prisma.comment.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'asc' },
      include: {
        createdBy: {
          select: { id: true, username: true },
        },
      },
    }) as Promise<CommentWithAuthor[]>;
  }

  async findById(id: string): Promise<Comment | null> {
    return prisma.comment.findUnique({ where: { id } });
  }

  async update(id: string, data: Partial<Pick<Comment, 'message' | 'isEdited' | 'isDeleted'>>): Promise<Comment> {
    return prisma.comment.update({ where: { id }, data });
  }
}

export const commentRepository = new CommentRepository();
