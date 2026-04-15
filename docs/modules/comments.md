# Comments Module

Comments provide a threaded discussion space attached to a specific request (adjustment or transfer). They appear in the activity timeline alongside status events and attachments.

---

## Table of Contents

1. [Purpose](#1-purpose)
2. [API Reference](#2-api-reference)
3. [Constraints and Rules](#3-constraints-and-rules)
4. [Timeline Behavior](#4-timeline-behavior)
5. [Frontend Integration](#5-frontend-integration)
6. [Do / Don't](#6-do--dont)
7. [Cross-Module Relationships](#7-cross-module-relationships)

---

## 1. Purpose

- Allow users to communicate about a request without leaving the system.
- Maintain a permanent, visible audit trail of discussion — even after comments are deleted.
- Tied to a specific `entityType` (`ADJUSTMENT` or `TRANSFER`) and `entityId` (request UUID).

---

## 2. API Reference

All comment endpoints require a valid `Authorization: Bearer <token>` header.

### Create a comment

```
POST /api/v1/comments
Content-Type: application/json

{
  "entityType": "ADJUSTMENT",   // or "TRANSFER"
  "entityId":   "<request-uuid>",
  "message":    "Your comment text"
}
```

**Response:** `201 Created`

```json
{
  "success": true,
  "data": {
    "id":          "<comment-uuid>",
    "entityType":  "ADJUSTMENT",
    "entityId":    "<request-uuid>",
    "message":     "Your comment text",
    "createdById": "<user-uuid>",
    "isEdited":    false,
    "editCount":   0,
    "isDeleted":   false,
    "createdAt":   "2024-03-01T10:00:00.000Z",
    "updatedAt":   "2024-03-01T10:00:00.000Z"
  }
}
```

**Validation:**
- `message` must be non-empty after trimming whitespace.

---

### Edit a comment

```
PATCH /api/v1/comments/:id
Content-Type: application/json

{
  "message": "Updated comment text"
}
```

**Response:** `200 OK` — returns the updated comment object.

**Authorization:** Creator only. The backend checks `comment.createdById === req.user.id`.

**Constraints:**
- Cannot edit a deleted comment (`isDeleted: true`) → `400 VALIDATION_ERROR`
- Cannot edit if `editCount >= 3` → `400 VALIDATION_ERROR: Edit limit reached (max 3)`
- `message` must be non-empty after trimming.

On success, `isEdited` is set to `true` and `editCount` is incremented.

---

### Delete a comment

```
DELETE /api/v1/comments/:id
```

**Response:** `200 OK` — returns the updated comment object.

**Authorization:** Creator only. The backend checks `comment.createdById === req.user.id`.

**Behavior:** This is a **soft delete**. The comment record is not removed from the database. Instead:
- `isDeleted` → `true`
- `isEdited` → `false` (edited indicator is cleared)
- `message` → `'This comment has been deleted'` (stored in DB)

The comment remains visible in the timeline with its content replaced by a placeholder.

---

## 3. Constraints and Rules

### Edit limit

Each comment may be edited at most **3 times**. This is enforced server-side via the `editCount` field. Once `editCount` reaches 3, the edit endpoint returns a `400` error regardless of content.

The frontend enforces this visually — the Edit button is hidden when `editCount >= 3` — but the backend is the authoritative enforcer.

### Ownership

Only the original creator can edit or delete their comment. There is no admin override for comment editing or deletion — admins are not treated differently for comment operations.

### Spam guard (frontend only)

`TimelineSection` enforces a 10-second cooldown (`SPAM_DELAY_MS = 10_000`) between comment submissions on the client side. This is a frontend-only guard; the backend imposes no rate limit. Do not rely on the frontend guard in API integrations.

### Empty message

Both create and edit reject an empty or whitespace-only `message` with `400 VALIDATION_ERROR`.

---

## 4. Timeline Behavior

| Operation | Timeline Effect |
|-----------|----------------|
| Create | New `COMMENT` event appears in the timeline immediately (SSE push) |
| Edit | The timeline REST response reflects the updated content on next fetch; **no SSE event is emitted for edits** |
| Delete | The timeline REST response reflects `isDeleted: true`, `content: null`; **no SSE event is emitted for deletes** |

### How deleted comments appear in the timeline

```json
{
  "id":        "comment-<uuid>",
  "type":      "COMMENT",
  "action":    "COMMENT",
  "timestamp": "2024-03-01T10:00:00.000Z",
  "user":      { "id": "...", "username": "jane" },
  "metadata": {
    "content":   null,
    "editedAt":  null,
    "isDeleted": true,
    "editCount": 1
  }
}
```

The comment entry is **never removed** from the timeline. This preserves the completeness of the activity record.

### SSE note

Only **comment creation** triggers an SSE push (`emitTimelineEvent`). Edits and deletes do not. The frontend compensates by calling `refreshTimeline()` (full REST re-fetch) after edit and delete operations.

---

## 5. Frontend Integration

The `TimelineSection` component (`frontend/src/components/TimelineSection.tsx`) handles all comment UI inline within the timeline. There is no separate comments component.

### Comment input

- Always visible at the top of the timeline section.
- Enforces 10-second spam guard with inline warning.
- After successful create: re-fetches timeline and shows toast.

### Edit flow

- Edit button visible only to the comment's owner (`event.user.id === currentUser.id`) when `isDeleted = false`.
- Edit button hidden when `editCount >= 3`.
- Editing in-place within the timeline card; shows remaining edits count.
- On save: calls `editComment(id, text)` → `PATCH /api/v1/comments/:id` → re-fetches timeline.

### Delete flow

- Delete button visible only to the comment's owner when `isDeleted = false`.
- Confirmation dialog before deletion.
- On confirm: calls `deleteComment(id)` → `DELETE /api/v1/comments/:id` → re-fetches timeline.
- After deletion, the event renders with italic placeholder text.

### Frontend service (`frontend/src/services/comments.service.ts`)

```typescript
createComment({ entityType, entityId, message })
  → POST /api/v1/comments

editComment(id, message)
  → PATCH /api/v1/comments/:id

deleteComment(id)
  → DELETE /api/v1/comments/:id
```

---

## 6. Do / Don't

| | |
|---|---|
| ✅ | Re-fetch the full timeline after edit/delete — SSE does not push those events |
| ✅ | Show remaining edit count in the UI (`3 - editCount`) |
| ✅ | Show deleted comments as placeholders, not hidden |
| ✅ | Enforce the 3-edit limit server-side — never trust only client checks |
| ❌ | Do not remove deleted comments from the timeline display |
| ❌ | Do not allow editing another user's comment, even as an admin |
| ❌ | Do not rely on the frontend spam guard as a security measure |
| ❌ | Do not re-use `editCount` to mean anything other than the number of completed edits |

---

## 7. Cross-Module Relationships

- **Timeline:** Comments are fetched by `TimelineService` via `commentRepository.findByEntity()` and rendered as `COMMENT` events. Comment creation pushes an SSE event to all timeline subscribers for that entity.
- **AuditLog:** Comment operations do **not** write `AuditLog` entries. The comment's own `isEdited`, `editCount`, and `isDeleted` fields serve as the audit record.
- **Attachments:** Independent — comments and attachments share the same timeline but are managed separately.
