import prisma from '../../config/database';
import { commentRepository, CommentWithAuthor } from '../comments/repositories/comment.repository';
import { attachmentRepository, AttachmentWithUploader } from '../attachments/repositories/attachment.repository';

interface RawAuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  beforeSnapshot: object | null;
  afterSnapshot: object | null;
  timestamp: Date;
  user: { id: string; username: string };
}

export interface TimelineEvent {
  id: string;
  type: 'SYSTEM' | 'COMMENT' | 'ATTACHMENT';
  action: string;
  user: { id: string; username: string };
  timestamp: Date;
  metadata: object;
}

export interface TimelineResult {
  events: TimelineEvent[];
}

const STATUS_TO_ACTION: Record<string, string> = {
  SUBMITTED: 'SUBMIT',
  APPROVED:  'APPROVE',
  REJECTED:  'REJECT',
  CANCELLED: 'CANCEL',
  FINALIZED: 'FINALIZE',
};

export class TimelineService {
  async getTimeline(entityType: string, entityId: string): Promise<TimelineResult> {
    const logs = await prisma.auditLog.findMany({
      where: {
        entityType: { equals: entityType, mode: 'insensitive' },
        entityId,
      },
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        beforeSnapshot: true,
        afterSnapshot: true,
        timestamp: true,
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
      orderBy: { timestamp: 'asc' },
    }) as unknown as RawAuditLog[];

    const [comments, attachments] = await Promise.all([
      commentRepository.findByEntity(entityType, entityId),
      attachmentRepository.findByEntity(entityType, entityId),
    ]);

    const systemEvents = logs.map((log) => {
      if (log.action !== 'STATUS_CHANGE') return null;

      const beforeStatus = (log.beforeSnapshot as any)?.status;
      const afterStatus  = (log.afterSnapshot as any)?.status;

      if (!afterStatus || beforeStatus === afterStatus) return null;

      const action = STATUS_TO_ACTION[afterStatus] || 'UPDATE';

      return {
        id: `audit-${log.id}`,
        type: 'SYSTEM' as const,
        action,
        user: log.user,
        timestamp: log.timestamp,
        metadata: {
          from: beforeStatus,
          to: afterStatus,
        },
      };
    }).filter(Boolean) as TimelineEvent[];

    const commentEvents = comments.map((c: CommentWithAuthor) => {
      try {
        return {
          id: `comment-${c.id}`,
          type: 'COMMENT' as const,
          action: 'COMMENT',
          user: c.createdBy,
          timestamp: c.createdAt,
          metadata: {
            content: c.message,
            editedAt: c.isEdited ? c.updatedAt : null,
          },
        };
      } catch {
        return null;
      }
    }).filter(Boolean) as TimelineEvent[];

    const attachmentEvents = attachments.map((a: AttachmentWithUploader) => {
      try {
        return {
          id: `attachment-${a.id}`,
          type: 'ATTACHMENT' as const,
          action: 'UPLOAD',
          user: a.uploadedBy,
          timestamp: a.createdAt,
          metadata: {
            fileName: a.fileName,
            filePath: a.filePath,
          },
        };
      } catch {
        return null;
      }
    }).filter(Boolean) as TimelineEvent[];

    const events = [
      ...systemEvents,
      ...commentEvents,
      ...attachmentEvents,
    ];

    events.sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    return { events };
  }
}

export const timelineService = new TimelineService();
