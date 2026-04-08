import { Comment } from '@prisma/client';
import { CommentRepository, CommentWithAuthor, commentRepository } from './repositories/comment.repository';
import { NotFoundError, ValidationError, ForbiddenError } from '../../utils/errors';

export class CommentsService {
  constructor(private readonly repo: CommentRepository) {}

  async createComment(
    entityType: string,
    entityId: string,
    message: string,
    userId: string,
  ): Promise<Comment> {
    const trimmed = message.trim();
    if (!trimmed) {
      throw new ValidationError('Comment message cannot be empty');
    }

    return this.repo.create({
      entityType,
      entityId,
      message: trimmed,
      createdById: userId,
    });
  }

  async getComments(entityType: string, entityId: string): Promise<CommentWithAuthor[]> {
    return this.repo.findByEntity(entityType, entityId);
  }

  async editComment(commentId: string, message: string, userId: string): Promise<Comment> {
    const comment = await this.repo.findById(commentId);

    if (!comment) {
      throw new NotFoundError('Comment not found');
    }

    if (comment.isDeleted) {
      throw new ValidationError('Cannot edit a deleted comment');
    }

    if (comment.createdById !== userId) {
      throw new ForbiddenError('You can only edit your own comments');
    }

    const trimmed = message.trim();
    if (!trimmed) {
      throw new ValidationError('Comment message cannot be empty');
    }

    return this.repo.update(commentId, {
      message: trimmed,
      isEdited: true,
    });
  }

  async deleteComment(commentId: string, userId: string): Promise<Comment> {
    const comment = await this.repo.findById(commentId);

    if (!comment) {
      throw new NotFoundError('Comment not found');
    }

    if (comment.isDeleted) {
      throw new ValidationError('Comment is already deleted');
    }

    if (comment.createdById !== userId) {
      throw new ForbiddenError('You can only delete your own comments');
    }

    return this.repo.update(commentId, {
      isDeleted: true,
      message: 'This comment has been deleted',
    });
  }
}

export const commentsService = new CommentsService(commentRepository);
