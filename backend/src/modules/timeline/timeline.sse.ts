import { Response } from 'express';

// Normalize raw entity type strings to the canonical form used as SSE keys.
// Handles cases where a caller passes the Prisma entity type instead of the
// short form (e.g. 'STOCK_ADJUSTMENT_REQUEST' → 'ADJUSTMENT').
function normalizeEntityType(type: string): string {
  if (type === 'STOCK_ADJUSTMENT_REQUEST') return 'ADJUSTMENT';
  if (type === 'STOCK_TRANSFER_REQUEST')   return 'TRANSFER';
  return type;
}

// In-memory SSE client registry keyed by "entityType:entityId"
const clients: Record<string, Response[]> = {};

export function registerSSEClient(entityType: string, entityId: string, res: Response): void {
  const key = `${normalizeEntityType(entityType)}:${entityId}`;
  if (!clients[key]) clients[key] = [];
  clients[key].push(res);
  console.log('SSE CLIENT CONNECTED:', key, `(${clients[key].length} subscriber(s))`);
}

export function unregisterSSEClient(entityType: string, entityId: string, res: Response): void {
  const key = `${normalizeEntityType(entityType)}:${entityId}`;
  if (clients[key]) {
    clients[key] = clients[key].filter((c) => c !== res);
    console.log('SSE CLIENT DISCONNECTED:', key, `(${clients[key].length} subscriber(s) remaining)`);
  }
}

export function emitTimelineEvent(entityType: string, entityId: string, event: object): void {
  const key = `${normalizeEntityType(entityType)}:${entityId}`;
  const subs = clients[key] || [];

  console.log('EMIT EVENT:', { entityType, entityId, key, subscribers: subs.length, event });

  if (subs.length === 0) return;

  const payload = `data: ${JSON.stringify(event)}\n\n`;
  subs.forEach((res) => {
    try {
      res.write(payload);
      // Flush through any compression middleware (e.g. compression package)
      if (typeof (res as any).flush === 'function') {
        (res as any).flush();
      }
    } catch {
      // Client already disconnected — ignore
    }
  });
}
