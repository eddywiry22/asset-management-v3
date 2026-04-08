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

const FALLBACK_USER: TimelineUser = { id: 'system', username: 'System' };

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

    const STATUS_TO_ACTION: Record<string, string> = {
      SUBMITTED: 'SUBMIT',
      APPROVED:  'APPROVE',
      REJECTED:  'REJECT',
      CANCELLED: 'CANCEL',
      FINALIZED: 'FINALIZE',
    };

    const auditEvents = (auditLogs || [])
      .map((log) => {
        try {
          if (!log) return null;

          if (log.action !== 'STATUS_CHANGE') return null;

          const beforeStatus = (log.beforeSnapshot as any)?.status;
          const afterStatus  = (log.afterSnapshot as any)?.status;

          console.log('Timeline STATUS_CHANGE:', { beforeStatus, afterStatus });

          if (!afterStatus || beforeStatus === afterStatus) return null;

          const action = STATUS_TO_ACTION[afterStatus] || 'UPDATE';

          return {
            id: `audit-${log.id}`,
            type: 'SYSTEM' as const,
            action,
            user: log.user || { id: 'system', username: 'System' },
            timestamp: log.timestamp,
            metadata: {
              from: beforeStatus,
              to: afterStatus,
            },
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
