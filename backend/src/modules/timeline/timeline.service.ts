import prisma from '../../config/database';

export interface AuditLogEvent {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  beforeSnapshot: object | null;
  afterSnapshot: object | null;
  timestamp: Date;
  user: { id: string; username: string };
}

export interface TimelineResult {
  events: AuditLogEvent[];
}

export class TimelineService {
  async getTimeline(entityType: string, entityId: string): Promise<TimelineResult> {
    const events = await prisma.auditLog.findMany({
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
    });

    return { events };
  }
}

export const timelineService = new TimelineService();
