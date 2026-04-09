import prisma from '../../config/database';
import { commentRepository } from '../comments/repositories/comment.repository';
import { attachmentRepository } from '../attachments/repositories/attachment.repository';

const STATUS_TO_ACTION: Record<string, string> = {
  DRAFT:     'DRAFT',
  SUBMITTED: 'SUBMIT',
  APPROVED:  'APPROVE',
  REJECTED:  'REJECT',
  CANCELLED: 'CANCEL',
  FINALIZED: 'FINALIZE',
};

export class TimelineService {
  async getTimeline(entityType: string, entityId: string): Promise<{ events: any[] }> {
    try {
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          entityType: { equals: entityType, mode: 'insensitive' },
          entityId,
        },
        select: {
          id:             true,
          action:         true,
          entityType:     true,
          entityId:       true,
          beforeSnapshot: true,
          afterSnapshot:  true,
          timestamp:      true,
          user: {
            select: { id: true, username: true },
          },
        },
        orderBy: { timestamp: 'asc' },
      }) as any[];

      const [comments, attachments] = await Promise.all([
        commentRepository.findByEntity(entityType, entityId),
        attachmentRepository.findByEntity(entityType, entityId),
      ]);

      console.log('AUDIT LOGS RAW:', auditLogs.map((l: any) => ({
        action: l.action,
        before: l.beforeSnapshot,
        after:  l.afterSnapshot,
      })));

      const systemEvents = (auditLogs as any[])
        .map((log: any) => {
          try {
            const before = typeof log.beforeSnapshot === 'string'
              ? JSON.parse(log.beforeSnapshot)
              : log.beforeSnapshot;

            const after = typeof log.afterSnapshot === 'string'
              ? JSON.parse(log.afterSnapshot)
              : log.afterSnapshot;

            const beforeStatus = before?.status;
            const afterStatus  = after?.status;

            if (!afterStatus || beforeStatus === afterStatus) return null;

            return {
              id:        `audit-${log.id}`,
              type:      'SYSTEM',
              action:    STATUS_TO_ACTION[afterStatus] || log.action || 'UPDATE',
              timestamp: log.timestamp,
              user:      log.user || { id: 'system', username: 'System' },
              metadata:  { from: beforeStatus, to: afterStatus, rawAction: log.action },
            };
          } catch (e) {
            console.error('SYSTEM mapping error:', e, log);
            return null;
          }
        })
        .filter(Boolean);

      const commentEvents = (comments as any[])
        .map((c: any) => {
          try {
            if (!c?.id || !c?.message) return null;

            return {
              id:        `comment-${c.id}`,
              type:      'COMMENT',
              action:    'COMMENT',
              timestamp: c.createdAt,
              user:      c.createdBy || { id: 'system', username: 'System' },
              metadata:  {
                content:  c.message,
                editedAt: c.isEdited ? c.updatedAt : null,
              },
            };
          } catch (e) {
            console.error('COMMENT mapping error:', e, c);
            return null;
          }
        })
        .filter(Boolean);

      const attachmentEvents = (attachments as any[])
        .map((a: any) => {
          try {
            if (!a?.id) return null;

            return {
              id:        `attachment-${a.id}`,
              type:      'ATTACHMENT',
              action:    'UPLOAD',
              timestamp: a.createdAt,
              user:      a.uploadedBy || { id: 'system', username: 'System' },
              metadata:  {
                fileName: a.fileName,
                filePath: a.filePath,
              },
            };
          } catch (e) {
            console.error('ATTACHMENT mapping error:', e, a);
            return null;
          }
        })
        .filter(Boolean);

      console.log('Timeline result:', {
        audit:       auditLogs.length,
        system:      systemEvents.length,
        comments:    commentEvents.length,
        attachments: attachmentEvents.length,
      });

      const events = [
        ...systemEvents,
        ...commentEvents,
        ...attachmentEvents,
      ]
        .filter((e: any) => e && e.timestamp)
        .sort((a: any, b: any) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

      return { events };
    } catch (err) {
      console.error('Timeline fatal error:', err);
      return { events: [] };
    }
  }
}

export const timelineService = new TimelineService();
