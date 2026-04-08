import prisma from '../../config/database';

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
  type: 'SYSTEM';
  action: string;
  user: { id: string; username: string };
  timestamp: Date;
  metadata: {
    from: string | undefined;
    to: string;
  };
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

    const events = logs.map((log) => {
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

    return { events };
  }
}

export const timelineService = new TimelineService();
