# Timeline Module

The timeline provides a unified, chronologically ordered activity stream for every request (adjustment or transfer). It aggregates status transitions, comments, and attachments into a single feed that updates in real time via Server-Sent Events (SSE).

---

## Table of Contents

1. [Purpose](#1-purpose)
2. [Data Sources](#2-data-sources)
3. [Event Structure](#3-event-structure)
4. [REST API](#4-rest-api)
5. [Real-Time SSE](#5-real-time-sse)
6. [Frontend Integration](#6-frontend-integration)
7. [Key Rules and Invariants](#7-key-rules-and-invariants)
8. [Cross-Module Relationships](#8-cross-module-relationships)
9. [Common Pitfalls](#9-common-pitfalls)

---

## 1. Purpose

The timeline answers the question: _"What has happened to this request, in what order, and by whom?"_

It covers three event categories:

| Category | Produced by | Examples |
|----------|-------------|---------|
| `SYSTEM` | Workflow status transitions | Submit, Approve, Finalize, Cancel |
| `COMMENT` | User comments | Posted, edited, or deleted comments |
| `ATTACHMENT` | File uploads/deletions | File uploaded, file deleted |

---

## 2. Data Sources

The timeline is **derived at read time** from three independent tables. There is no separate timeline table.

### SYSTEM events — from `AuditLog`

Every workflow mutation (submit, approve, reject, finalize, cancel) writes an `AuditLog` row. The `TimelineService` reads those rows and derives SYSTEM events by comparing `beforeSnapshot.status` and `afterSnapshot.status`. Entries where the status did not change are excluded.

The `action` field is mapped from the resulting status:

| Status reached | `action` value |
|----------------|----------------|
| `SUBMITTED` | `SUBMIT` |
| `APPROVED` | `APPROVE` |
| `FINALIZED` | `FINALIZE` |
| `REJECTED` | `REJECT` |
| `CANCELLED` | `CANCEL` |
| `ORIGIN_MANAGER_APPROVED` | `STATUS_CHANGE` (not in map — falls back to `log.action`) |
| `READY_TO_FINALIZE` | `STATUS_CHANGE` (not in map — falls back to `log.action`) |

> Use `metadata.from` / `metadata.to` (not `action`) as the reliable indicator of which transition occurred.

### COMMENT events — from `Comment` table

Fetched via `commentRepository.findByEntity(entityType, entityId)`. Soft-deleted comments (where `isDeleted = true`) are included but their content is replaced by `null`.

### ATTACHMENT events — from `Attachment` table

Fetched via `attachmentRepository.findByEntity(entityType, entityId)`. Each attachment appears once with `action: 'UPLOAD'`. Deletions are pushed in real time via SSE with `action: 'DELETE'` but are **not** back-filled into the REST response (deleted attachments are hard-deleted from the database).

---

## 3. Event Structure

All events share the same shape:

```typescript
{
  id:        string;      // prefixed: "audit-<uuid>", "comment-<uuid>", "attachment-<uuid>"
  type:      'SYSTEM' | 'COMMENT' | 'ATTACHMENT';
  action:    string;      // see per-type values below
  timestamp: string;      // ISO 8601
  user: {
    id:       string;
    username: string;
  };
  metadata:  object;      // shape varies by type — see below
}
```

### SYSTEM metadata

```typescript
{
  from:       string | null;  // beforeSnapshot.status
  to:         string;         // afterSnapshot.status
  rawAction:  string;         // the AuditLog.action value, e.g. "STATUS_CHANGE"
}
```

### COMMENT metadata

```typescript
{
  content:   string | null;   // null when isDeleted = true
  editedAt:  string | null;   // ISO timestamp of last edit; null if not edited or deleted
  isDeleted: boolean;
  editCount: number;          // 0–3
}
```

### ATTACHMENT metadata

```typescript
// On UPLOAD (REST + SSE):
{
  fileName:    string;
  filePath:    string;        // server-side path (use download endpoint, not this path)
  description: string | null;
}

// On DELETE (SSE only):
{
  fileName: string;
}
```

---

## 4. REST API

### Get timeline

```
GET /api/v1/timeline/:entityType/:entityId
Authorization: Bearer <token>
```

**Path params:**

| Param | Values | Description |
|-------|--------|-------------|
| `entityType` | `ADJUSTMENT`, `TRANSFER` | The request type |
| `entityId` | UUID | The request ID |

**Response:**

```json
{
  "success": true,
  "data": {
    "events": [ ...event objects... ]
  }
}
```

Events are returned sorted **ascending by `timestamp`** from the backend. The frontend (`TimelineSection`) re-sorts them **descending** (newest first) for display.

**Example — fetching the timeline for an adjustment:**

```typescript
const res = await fetch('/api/v1/timeline/ADJUSTMENT/<uuid>', {
  headers: { Authorization: `Bearer ${token}` },
});
const { data } = await res.json();
// data.events → array sorted oldest→newest
```

---

## 5. Real-Time SSE

### Subscribe to live updates

```
GET /api/v1/timeline/stream/:entityType/:entityId?token=<access_token>
```

> **Why `?token=` instead of `Authorization` header?**
> The browser `EventSource` API does not support custom request headers. The JWT is passed as a query parameter instead and is verified server-side using the same `authService.verifyAccessToken()` method used by all other routes.

**Connection behaviour:**

| Phase | What happens |
|-------|-------------|
| Connected | Client added to in-memory subscriber list for that entity |
| Heartbeat | Server sends `: keep-alive` comment every 15 seconds |
| Event pushed | Server writes `data: <JSON>\n\n` to all subscribers |
| Disconnected | Client removed from subscriber list (`req.on('close')`) |

**Events emitted over SSE** — called from service layer after each mutation:

| Trigger | `type` | `action` |
|---------|--------|---------|
| Adjustment/Transfer submit | `SYSTEM` | `SUBMIT` |
| Adjustment approve | `SYSTEM` | `APPROVE` |
| Transfer approve origin | `SYSTEM` | `APPROVE` |
| Transfer approve destination | `SYSTEM` | `APPROVE` |
| Adjustment/Transfer reject | `SYSTEM` | `REJECT` |
| Adjustment/Transfer finalize | `SYSTEM` | `FINALIZE` |
| Adjustment/Transfer cancel | `SYSTEM` | `CANCEL` |
| Comment created | `COMMENT` | `COMMENT` |
| Attachment uploaded | `ATTACHMENT` | `UPLOAD` |
| Attachment deleted | `ATTACHMENT` | `DELETE` |

> **Note:** SSE is in-memory and process-local. Events emitted by one server process do not reach clients connected to a different process. Horizontal scaling requires a shared pub/sub layer, which is not currently implemented.

---

## 6. Frontend Integration

### `TimelineSection` component

`TimelineSection` (`frontend/src/components/TimelineSection.tsx`) is the primary consumer. It is a self-contained component that:

1. Fetches the full timeline on mount via `getTimeline()`.
2. Opens an SSE connection and prepends incoming events to local state, deduplicating by `(id, action)`.
3. Renders SYSTEM, COMMENT, and ATTACHMENT events with type-specific styling.
4. Provides an inline comment input with a 10-second spam guard.
5. Re-renders relative timestamps every 60 seconds.

**Props:**

```typescript
{
  entityType: string;  // 'ADJUSTMENT' | 'TRANSFER'
  entityId:   string;  // request UUID
}
```

**Usage:**

```tsx
<TimelineSection entityType="ADJUSTMENT" entityId={request.id} />
```

### Deduplication rule

The SSE handler deduplicates incoming events against existing state using `(id, action)` — not just `id`. This means an `UPLOAD` event and a subsequent `DELETE` event for the same attachment both appear in the timeline even though they share the same `id` prefix.

```typescript
const exists = prev.some(e => e.id === newEvent.id && e.action === newEvent.action);
```

### Comment / attachment mutations after action

After `createComment`, `editComment`, and `deleteComment`, the component re-fetches the full timeline (`refreshTimeline()`) rather than relying solely on SSE. This ensures the REST state stays in sync even if the SSE event was missed.

---

## 7. Key Rules and Invariants

- **The timeline is never stored.** It is always derived from `AuditLog`, `Comment`, and `Attachment` at query time. Do not attempt to write to a "timeline table."
- **AuditLog entries are never deleted.** SYSTEM events are append-only. The only way a SYSTEM event disappears is if the corresponding `AuditLog` row was never written.
- **Deleted comments remain in the timeline.** `isDeleted: true` replaces the content with `null` and clears `editedAt`. The event entry itself is not removed.
- **Deleted attachments are visible in SSE only.** Hard deletion removes the record from the database, so a `DELETE` event only appears via SSE push. It does not show up in subsequent REST timeline fetches.
- **Sort order:** The backend returns events oldest→newest. `TimelineSection` reverses this to newest→oldest for display. If you consume the REST API directly, sort accordingly.
- **`finalizedAt` is the stock-change timestamp.** When displaying when stock actually changed, use the `finalizedAt` field on the request, not the `createdAt` of any timeline event.

---

## 8. Cross-Module Relationships

```
AuditLog        ──► SYSTEM events
Comment table   ──► COMMENT events    ─┐
Attachment table ──► ATTACHMENT events  ├─► TimelineService.getTimeline()
                                        │
                                        └─► SSE (emitTimelineEvent)
                                              called by:
                                              - StockAdjustmentService
                                              - TransferService
                                              - CommentsService
                                              - AttachmentsService
```

- Every workflow service calls `emitTimelineEvent()` after its transaction commits.
- `CommentsService.createComment()` calls `emitTimelineEvent()` on comment creation. Edit and delete do **not** push SSE events — the frontend refreshes via REST instead.
- `AttachmentsService` calls `emitTimelineEvent()` on both upload and delete.

---

## 9. Common Pitfalls

| Pitfall | What to do instead |
|---------|-------------------|
| Missing SYSTEM events in timeline | Check `AuditLog` for the entity — if the row is absent, the issue is in the service's `auditService.log()` call, not in the timeline layer |
| SSE events not received | Verify the `?token=` query param is a valid, non-expired access token; check browser network tab for the SSE connection status |
| `action: 'STATUS_CHANGE'` seen for transfer approvals | Expected — `ORIGIN_MANAGER_APPROVED` and `READY_TO_FINALIZE` are not in the `STATUS_TO_ACTION` map; read `metadata.to` instead |
| Deleted attachment still showing in timeline after page refresh | Correct behavior — hard deletion removes the record, so the REST response will no longer include it; SSE delivered the `DELETE` event only to connected clients |
| Mutating `events` state directly to "optimistically update" | Don't — call `refreshTimeline()` after mutations or let SSE deliver the update; direct state mutation bypasses deduplication logic |
