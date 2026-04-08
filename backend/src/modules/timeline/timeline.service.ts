import { auditRepository } from '../audit/audit.repository';
import { attachmentRepository } from '../attachments/repositories/attachment.repository';
import { commentRepository } from '../comments/repositories/comment.repository';

export interface TimelineEvent {
  id: string;
  type: 'SYSTEM' | 'ATTACHMENT' | 'COMMENT';
  action: string;
  user: object;
  timestamp: Date;
  metadata: object;
}

export interface TimelineResult {
  events: TimelineEvent[];
}

export class TimelineService {
  async getTimeline(entityType: string, entityId: string): Promise<TimelineResult> {
    const [auditLogs, attachments, comments] = await Promise.all([
      auditRepository.findByEntity(entityType, entityId),
      attachmentRepository.findByEntity(entityType, entityId),
      commentRepository.findByEntity(entityType, entityId),
    ]);

    const auditEvents: TimelineEvent[] = auditLogs.map((log) => ({
      id: log.id,
      type: 'SYSTEM',
      action: log.action,
      user: log.user,
      timestamp: log.timestamp,
      metadata: {
        beforeSnapshot: log.beforeSnapshot,
        afterSnapshot: log.afterSnapshot,
        warnings: log.warnings,
      },
    }));

    const attachmentEvents: TimelineEvent[] = attachments.map((a) => ({
      id: a.id,
      type: 'ATTACHMENT',
      action: 'UPLOADED',
      user: a.uploadedBy,
      timestamp: a.createdAt,
      metadata: {
        fileName: a.fileName,
        description: a.description,
        attachmentId: a.id,
      },
    }));

    const commentEvents: TimelineEvent[] = comments.map((c) => ({
      id: c.id,
      type: 'COMMENT',
      action: 'COMMENTED',
      user: c.createdBy,
      timestamp: c.createdAt,
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
