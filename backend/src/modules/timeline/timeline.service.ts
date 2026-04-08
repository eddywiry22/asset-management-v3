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

const FALLBACK_USER: TimelineUser = { id: 'unknown', username: 'System' };

export class TimelineService {
  async getTimeline(entityType: string, entityId: string): Promise<TimelineResult> {
    const normalizedType = entityType.toUpperCase();

    const [auditLogs, attachments, comments] = await Promise.all([
      auditRepository.findByEntity(normalizedType, entityId),
      attachmentRepository.findByEntity(normalizedType, entityId),
      commentRepository.findByEntity(normalizedType, entityId),
    ]);

    console.log('Timeline audit logs:', auditLogs);

    const auditEvents = auditLogs.map((log) => {
      try {
        const user: TimelineUser = log.user || FALLBACK_USER;
        const timestamp = (log as any).createdAt
          ? new Date((log as any).createdAt).toISOString()
          : new Date(log.timestamp).toISOString();
        const metadata = {
          beforeSnapshot: log.beforeSnapshot,
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
        // Derive semantic action from afterValue.status.
        if (log.action === 'STATUS_CHANGE') {
          const status = (log as any).afterValue?.status as string | undefined;

          if (!status) return null;

          const mappedAction = STATUS_TO_ACTION[status];
          if (!mappedAction) return null;

          return {
            id: `audit-${log.id}`,
            type: 'SYSTEM' as const,
            action: mappedAction,
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
      } catch (err) {
        console.error('Timeline mapping error:', log, err);
        return null;
      }
    }).filter(Boolean) as TimelineEvent[];

    const attachmentEvents: TimelineEvent[] = attachments.map((a) => ({
      id: `attachment-${a.id}`,
      type: 'ATTACHMENT' as const,
      action: 'UPLOADED',
      user: a.uploadedBy || FALLBACK_USER,
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
      user: c.createdBy || FALLBACK_USER,
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
