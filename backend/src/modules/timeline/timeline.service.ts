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
  // fallback coverage
  DRAFT:                   'DRAFT',
  PENDING:                 'SUBMIT',
};

const FALLBACK_USER: TimelineUser = { id: 'unknown', username: 'System' };

export class TimelineService {
  async getTimeline(entityType: string, entityId: string): Promise<TimelineResult> {
    const normalizedType = entityType.toUpperCase();

    let auditLogs: any[] = [];
    let attachments: any[] = [];
    let comments: any[] = [];

    try {
      auditLogs = await auditRepository.findByEntity(normalizedType, entityId);
    } catch (err) {
      console.error('Audit fetch failed:', err);
    }

    try {
      attachments = await attachmentRepository.findByEntity(normalizedType, entityId);
    } catch (err) {
      console.error('Attachment fetch failed:', err);
    }

    try {
      comments = await commentRepository.findByEntity(normalizedType, entityId);
    } catch (err) {
      console.error('Comment fetch failed:', err);
    }

    console.log('Timeline audit logs:', auditLogs);

    const auditEvents = (auditLogs || [])
      .map((log) => {
        try {
          if (!log) return null;

          const user: TimelineUser = log.user || FALLBACK_USER;
          const timestamp = log.createdAt
            ? new Date(log.createdAt).toISOString()
            : log.timestamp
            ? new Date(log.timestamp).toISOString()
            : new Date().toISOString();

          // Direct lifecycle actions stored with explicit action names
          if (['SUBMIT', 'APPROVE', 'REJECT', 'CANCEL'].includes(log.action)) {
            return {
              id: `audit-${log.id}`,
              type: 'SYSTEM' as const,
              action: log.action,
              user,
              timestamp,
              metadata: log.metadata || {},
            };
          }

          // STATUS_CHANGE: decode afterValue.status into a semantic action.
          if (log.action === 'STATUS_CHANGE') {
            let afterValue = log.afterValue;

            if (typeof afterValue === 'string') {
              try {
                afterValue = JSON.parse(afterValue);
              } catch {
                afterValue = null;
              }
            }

            // Support both possible keys used across services
            const status = (afterValue?.status || afterValue?.newStatus || null) as string | null;

            if (!status) {
              console.log('Missing status in audit log:', log);
              return null;
            }

            const mappedAction = STATUS_TO_ACTION[status] || 'UPDATE';
            console.log('Mapped status → action:', status, mappedAction);

            return {
              id: `audit-${log.id}`,
              type: 'SYSTEM' as const,
              action: mappedAction,
              user,
              timestamp,
              metadata: log.metadata || {},
            };
          }

          if (log.action === 'ATTACHMENT_UPLOAD') {
            return {
              id: `audit-${log.id}`,
              type: 'ATTACHMENT' as const,
              action: 'UPLOADED',
              user,
              timestamp,
              metadata: { beforeSnapshot: log.beforeSnapshot, warnings: log.warnings },
            };
          }

          if (log.action === 'ATTACHMENT_DELETE') {
            return {
              id: `audit-${log.id}`,
              type: 'ATTACHMENT' as const,
              action: 'DELETED',
              user,
              timestamp,
              metadata: { beforeSnapshot: log.beforeSnapshot, warnings: log.warnings },
            };
          }

          return {
            id: `audit-${log.id}`,
            type: 'SYSTEM' as const,
            action: log.action,
            user,
            timestamp,
            metadata: log.metadata || {},
          };
        } catch (err) {
          console.error('Audit mapping error:', log, err);
          return null;
        }
      })
      .filter(Boolean) as TimelineEvent[];

    const attachmentEvents = (attachments || [])
      .map((a) => {
        try {
          if (!a) return null;

          return {
            id: `attachment-${a.id}`,
            type: 'ATTACHMENT' as const,
            action: 'UPLOADED',
            user: a.uploadedBy || FALLBACK_USER,
            timestamp: a.createdAt
              ? new Date(a.createdAt).toISOString()
              : new Date().toISOString(),
            metadata: {
              fileName: a.fileName,
              description: a.description,
              attachmentId: a.id,
            },
          };
        } catch (err) {
          console.error('Attachment mapping error:', a, err);
          return null;
        }
      })
      .filter(Boolean) as TimelineEvent[];

    const commentEvents = (comments || [])
      .map((c) => {
        try {
          if (!c) return null;

          return {
            id: `comment-${c.id}`,
            type: 'COMMENT' as const,
            action: 'COMMENTED',
            user: c.createdBy || FALLBACK_USER,
            timestamp: c.createdAt
              ? new Date(c.createdAt).toISOString()
              : new Date().toISOString(),
            metadata: {
              message: c.message,
              isEdited: c.isEdited,
              isDeleted: c.isDeleted,
              commentId: c.id,
            },
          };
        } catch (err) {
          console.error('Comment mapping error:', c, err);
          return null;
        }
      })
      .filter(Boolean) as TimelineEvent[];

    const events = [
      ...auditEvents,
      ...attachmentEvents,
      ...commentEvents,
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return { events };
  }
}

export const timelineService = new TimelineService();
