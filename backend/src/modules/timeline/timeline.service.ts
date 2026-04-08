import { auditRepository } from '../audit/audit.repository';
import { attachmentRepository } from '../attachments/repositories/attachment.repository';
import { commentRepository } from '../comments/repositories/comment.repository';

export interface TimelineUser {
  id: string;
  name: string;
}

export interface TimelineEvent {
  id: string;
  type: 'SYSTEM' | 'ATTACHMENT' | 'COMMENT';
  action: string;
  user: TimelineUser;
  timestamp: string;
  metadata: object;
}

export interface TimelineResult {
  events: TimelineEvent[];
}

export class TimelineService {
  async getTimeline(entityType: string, entityId: string): Promise<TimelineResult> {
    const normalizedType = entityType.toUpperCase();

    const [auditLogs, attachments, comments] = await Promise.all([
      auditRepository.findByEntity(normalizedType, entityId),
      attachmentRepository.findByEntity(normalizedType, entityId),
      commentRepository.findByEntity(normalizedType, entityId),
    ]);

    const auditEvents: TimelineEvent[] = auditLogs.map((log) => {
      const user: TimelineUser = { id: log.user.id, name: log.user.username };
      const timestamp = new Date(log.timestamp).toISOString();
      const metadata = {
        beforeSnapshot: log.beforeSnapshot,
        afterSnapshot: log.afterSnapshot,
        warnings: log.warnings,
      };

      if (log.action === 'ATTACHMENT_UPLOAD') {
        return {
          id: `audit-${log.id}`,
          type: 'ATTACHMENT' as const,
          action: 'UPLOADED',
          user,
          timestamp,
          metadata,
        };
      }

      if (log.action === 'ATTACHMENT_DELETE') {
        return {
          id: `audit-${log.id}`,
          type: 'ATTACHMENT' as const,
          action: 'DELETED',
          user,
          timestamp,
          metadata,
        };
      }

      return {
        id: `audit-${log.id}`,
        type: 'SYSTEM' as const,
        action: log.action,
        user,
        timestamp,
        metadata,
      };
    });

    const attachmentEvents: TimelineEvent[] = attachments.map((a) => ({
      id: `attachment-${a.id}`,
      type: 'ATTACHMENT' as const,
      action: 'UPLOADED',
      user: { id: a.uploadedBy.id, name: a.uploadedBy.username },
      timestamp: new Date(a.createdAt).toISOString(),
      metadata: {
        fileName: a.fileName,
        description: a.description,
        attachmentId: a.id,
      },
    }));

    const commentEvents: TimelineEvent[] = comments.map((c) => ({
      id: `comment-${c.id}`,
      type: 'COMMENT' as const,
      action: 'COMMENTED',
      user: { id: c.createdBy.id, name: c.createdBy.username },
      timestamp: new Date(c.createdAt).toISOString(),
      metadata: {
        message: c.message,
        isEdited: c.isEdited,
        isDeleted: c.isDeleted,
        commentId: c.id,
      },
    }));

    const events = [...auditEvents, ...attachmentEvents, ...commentEvents];

    events.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    return { events };
  }
}

export const timelineService = new TimelineService();
