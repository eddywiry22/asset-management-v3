import { auditRepository } from '../audit/audit.repository';
import { attachmentRepository } from '../attachments/repositories/attachment.repository';
import { commentRepository } from '../comments/repositories/comment.repository';

export interface TimelineUser {
  id: string;
  username: string;
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

// Maps the new status value from STATUS_CHANGE audit logs to a semantic action
// that the frontend can display meaningfully.
const STATUS_TO_ACTION: Record<string, string> = {
  SUBMITTED:               'SUBMIT',
  APPROVED:                'APPROVE',
  ORIGIN_MANAGER_APPROVED: 'APPROVE',
  READY_TO_FINALIZE:       'APPROVE',
  REJECTED:                'REJECT',
  CANCELLED:               'CANCEL',
  FINALIZED:               'FINALIZE',
};

export class TimelineService {
  async getTimeline(entityType: string, entityId: string): Promise<TimelineResult> {
    const normalizedType = entityType.toUpperCase();

    const [auditLogs, attachments, comments] = await Promise.all([
      auditRepository.findByEntity(normalizedType, entityId),
      attachmentRepository.findByEntity(normalizedType, entityId),
      commentRepository.findByEntity(normalizedType, entityId),
    ]);

    console.log('Timeline audit logs:', JSON.stringify(auditLogs, null, 2));

    const auditEvents: TimelineEvent[] = auditLogs.map((log) => {
      const user: TimelineUser = log.user;
      const timestamp = new Date(log.timestamp).toISOString();
      const metadata = {
        beforeSnapshot: log.beforeSnapshot,
        afterSnapshot: log.afterSnapshot,
        warnings: log.warnings,
      };

      // Direct lifecycle actions stored with explicit action names
      if (['SUBMIT', 'APPROVE', 'REJECT', 'CANCEL'].includes(log.action)) {
        return {
          id: `audit-${log.id}`,
          type: 'SYSTEM' as const,
          action: log.action,
          user,
          timestamp,
          metadata: (log as any).metadata || {},
        };
      }

      // STATUS_CHANGE: workflow services log all transitions this way.
      // Derive semantic action from afterSnapshot.status so they appear
      // as readable SYSTEM events (SUBMIT / APPROVE / REJECT / CANCEL / FINALIZE).
      if (log.action === 'STATUS_CHANGE') {
        const newStatus = (log.afterSnapshot as any)?.status as string | undefined;
        const semanticAction = newStatus
          ? (STATUS_TO_ACTION[newStatus] ?? log.action)
          : log.action;
        return {
          id: `audit-${log.id}`,
          type: 'SYSTEM' as const,
          action: semanticAction,
          user,
          timestamp,
          metadata,
        };
      }

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
      user: a.uploadedBy,
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
      user: c.createdBy,
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
