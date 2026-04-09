import { Response } from 'express';

// In-memory SSE client registry keyed by "entityType:entityId"
const clients: Record<string, Response[]> = {};

export function registerSSEClient(entityType: string, entityId: string, res: Response): void {
  const key = `${entityType}:${entityId}`;
  if (!clients[key]) clients[key] = [];
  clients[key].push(res);
}

export function unregisterSSEClient(entityType: string, entityId: string, res: Response): void {
  const key = `${entityType}:${entityId}`;
  if (clients[key]) {
    clients[key] = clients[key].filter((c) => c !== res);
  }
}

export function emitTimelineEvent(entityType: string, entityId: string, event: object): void {
  const key = `${entityType}:${entityId}`;
  const subs = clients[key] || [];
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  subs.forEach((res) => {
    try {
      res.write(payload);
    } catch {
      // Client already disconnected — ignore
    }
  });
}
