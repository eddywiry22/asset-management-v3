# Attachments Module

The attachments module allows users to upload files (images and PDFs) to a request. Attachments appear in the activity timeline and are stored on the server filesystem with metadata recorded in the database.

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

- Attach supporting documents (receipts, photos, signed forms) to adjustment or transfer requests.
- Provide download and image-preview access to all users who can view the request.
- Emit timeline events on upload and deletion for real-time visibility.

---

## 2. API Reference

All attachment endpoints require `Authorization: Bearer <token>`.

### Upload a file

```
POST /api/v1/attachments/:entityType/:entityId
Content-Type: multipart/form-data

file        (required) — the file binary
description (optional) — text description of the file
```

**Path params:**

| Param | Values |
|-------|--------|
| `entityType` | `ADJUSTMENT` or `TRANSFER` |
| `entityId` | UUID of the request |

**Response:** `200 OK`

```json
{
  "success": true,
  "data": {
    "id":          "<attachment-uuid>",
    "entityType":  "ADJUSTMENT",
    "entityId":    "<request-uuid>",
    "fileName":    "receipt.pdf",
    "filePath":    "/absolute/server/path/to/file",
    "mimeType":    "application/pdf",
    "fileSize":    102400,
    "description": "Supplier receipt",
    "uploadedById":"<user-uuid>",
    "createdAt":   "2024-03-01T10:00:00.000Z"
  }
}
```

**Storage:** Files are saved to `uploads/<entityType>/<entityId>/<uuid>-<originalname>` on the server filesystem. The `fileName` stored in the database is the **original filename**, not the UUID-prefixed path.

**Side effects:**
- Creates a database record in `Attachment`.
- Writes an `AuditLog` entry (`action: ATTACHMENT_UPLOAD`, `entityType: ATTACHMENT`).
- Emits an SSE timeline event (`type: ATTACHMENT`, `action: UPLOAD`) to all subscribers.

---

### List attachments for a request

```
GET /api/v1/attachments/:entityType/:entityId
```

**Response:** `200 OK`

```json
{
  "success": true,
  "data": [
    {
      "id":          "<uuid>",
      "fileName":    "receipt.pdf",
      "fileSize":    102400,
      "mimeType":    "application/pdf",
      "description": "Supplier receipt",
      "createdAt":   "2024-03-01T10:00:00.000Z",
      "uploadedBy":  { "id": "<uuid>", "username": "jane" }
    }
  ]
}
```

---

### Download a file

```
GET /api/v1/attachments/:id/download
```

Returns the file as a binary download (`Content-Disposition: attachment`). Use this URL for both download and in-browser preview (images are fetched as blobs by the frontend).

---

### Delete an attachment

```
DELETE /api/v1/attachments/:id
```

**Response:** `200 OK` — `{ "success": true }`

**Authorization:** The uploader or an Admin. Any other user receives `403 FORBIDDEN_ERROR`.

**Behavior:** This is a **hard delete**.
- The file is removed from the server filesystem (`fs.unlinkSync`).
- The database record is deleted.
- An `AuditLog` entry is written (`action: ATTACHMENT_DELETE`).
- An SSE timeline event is emitted (`type: ATTACHMENT`, `action: DELETE`).

> **Important:** Once deleted, the attachment record no longer exists. The `DELETE` SSE event is the only way currently connected clients learn about the deletion. Clients who fetch the REST timeline after the deletion will not see a `DELETE` event.

---

## 3. Constraints and Rules

### Allowed file types (frontend-enforced)

The frontend (`AttachmentsSection`) enforces these limits before upload:

| Constraint | Value |
|-----------|-------|
| Allowed MIME types | `image/jpeg`, `image/png`, `application/pdf` |
| Accepted extensions | `.jpg`, `.jpeg`, `.png`, `.pdf` |
| Max file size | **5 MB** per file |
| Max files per upload | **5 files** (batch upload sends each sequentially) |

> The backend uses `multer` middleware but does not independently enforce MIME type or size. Frontend validation is the primary guard. Integrations calling the API directly should apply the same constraints.

### Entity type restriction

`entityType` must be exactly `ADJUSTMENT` or `TRANSFER` (case-sensitive, uppercase). Any other value returns `400 VALIDATION_ERROR`.

### Authorization for deletion

| User | Can delete? |
|------|:-----------:|
| The uploader (`uploadedById === userId`) | ✓ |
| An admin (`isAdmin: true`) | ✓ |
| Any other authenticated user | ✗ |

The frontend hides the Delete button for users who do not meet this condition. The backend enforces it independently.

---

## 4. Timeline Behavior

| Operation | Timeline REST | Timeline SSE |
|-----------|:-------------:|:------------:|
| Upload | ATTACHMENT/UPLOAD event included | UPLOAD event pushed to subscribers |
| Delete | Event **not** included (record deleted) | DELETE event pushed to subscribers |

### How an uploaded attachment appears in the REST timeline

```json
{
  "id":        "attachment-<uuid>",
  "type":      "ATTACHMENT",
  "action":    "UPLOAD",
  "timestamp": "2024-03-01T10:06:00.000Z",
  "user":      { "id": "<uuid>", "username": "jane" },
  "metadata": {
    "fileName":    "receipt.pdf",
    "filePath":    "/uploads/ADJUSTMENT/<request-id>/uuid-receipt.pdf",
    "description": "Supplier receipt"
  }
}
```

### How a deletion appears via SSE

```json
{
  "id":        "attachment-<uuid>",
  "type":      "ATTACHMENT",
  "action":    "DELETE",
  "timestamp": "<iso-timestamp>",
  "user":      { "id": "<user-uuid>" },
  "metadata":  { "fileName": "receipt.pdf" }
}
```

> The DELETE SSE event shares the same `id` prefix as the original UPLOAD event. The frontend's deduplication logic uses `(id, action)` as the composite key so both events coexist in the timeline.

---

## 5. Frontend Integration

### `AttachmentsSection` component

`AttachmentsSection` (`frontend/src/components/AttachmentsSection.tsx`) manages the file list and upload/delete actions. It is **separate from the timeline** — it shows a structured table view and is not part of `TimelineSection`.

**Props:**

```typescript
{
  entityType:    string;   // 'ADJUSTMENT' | 'TRANSFER'
  entityId:      string;   // request UUID
  isAdmin:       boolean;
  requestStatus: string;   // e.g. 'DRAFT', 'SUBMITTED'
}
```

**Usage:**

```tsx
<AttachmentsSection
  entityType="ADJUSTMENT"
  entityId={request.id}
  isAdmin={currentUser.isAdmin}
  requestStatus={request.status}
/>
```

### Upload flow

1. User clicks **Upload** — opens a modal.
2. User selects up to 5 files (JPG/PNG/PDF, max 5 MB each).
3. User optionally adds a description per file.
4. On confirm, files are uploaded **sequentially** (one API call per file).
5. On success: attachment list is re-fetched via React Query, SSE event is pushed to timeline subscribers.

### Delete flow

1. Delete button visible only to the uploader or admin.
2. `window.confirm()` dialog before deletion.
3. On confirm: `DELETE /api/v1/attachments/:id` → hard deletes file and record.
4. Attachment list re-fetched. SSE event pushed to timeline subscribers.

### Download / Preview

- **Images (JPEG/PNG):** fetched as a blob and displayed in an in-app lightbox dialog.
- **PDFs and other files:** fetched as a blob and opened in a new browser tab.
- Both use `GET /api/v1/attachments/:id/download` with `responseType: 'blob'`.

### Frontend service (`frontend/src/services/attachments.service.ts`)

```typescript
attachmentsService.list(entityType, entityId)
  → GET /api/v1/attachments/:entityType/:entityId

attachmentsService.upload(entityType, entityId, files, descriptionMap)
  → POST /api/v1/attachments/:entityType/:entityId (once per file)

attachmentsService.download(id, fileName)
  → GET /api/v1/attachments/:id/download

attachmentsService.getPreviewBlob(id)
  → GET /api/v1/attachments/:id/download (returns blob URL)

attachmentsService.delete(id)
  → DELETE /api/v1/attachments/:id
```

---

## 6. Do / Don't

| | |
|---|---|
| ✅ | Use `GET /api/v1/attachments/:id/download` for both download and preview — never use `filePath` from the response directly |
| ✅ | Show the Delete button only to the uploader or admin |
| ✅ | Validate file type and size on the client before calling the upload API |
| ✅ | Revoke blob URLs after use (`window.URL.revokeObjectURL`) to prevent memory leaks |
| ✅ | Expect that DELETE events only arrive via SSE — don't assume they appear in REST timeline fetches |
| ❌ | Don't render a Delete button in `TimelineSection` — deletion belongs in `AttachmentsSection` only |
| ❌ | Don't use `filePath` from the attachment record to construct download links — paths are server-internal |
| ❌ | Don't upload outside the allowed MIME types and size limits, even via API |
| ❌ | Don't assume the file exists after deletion — the record and the file on disk are both removed |

---

## 7. Cross-Module Relationships

- **Timeline:** Both upload and delete emit `emitTimelineEvent()`. The upload event appears in REST timeline responses; the delete event is SSE-only (hard delete removes the DB record).
- **AuditLog:** Both upload and delete write `AuditLog` entries (`entityType: ATTACHMENT`). These are separate from the request's own audit trail.
- **Comments:** Independent — attachments and comments coexist in the timeline but are managed by separate services.
- **Filesystem:** Files are stored on the server's local disk under `uploads/<entityType>/<entityId>/`. There is no cloud storage integration currently. If the server is restarted or files are moved, `getAttachmentFile()` will return `404 NOT_FOUND_ERROR`.
