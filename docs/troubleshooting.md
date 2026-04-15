# Troubleshooting

A reference for common problems. Each entry explains the symptom, the root cause in this codebase, and how to fix it.

---

## Table of Contents

1. [Timeline Issues](#1-timeline-issues)
2. [Stock Report Issues](#2-stock-report-issues)
3. [Attachment Issues](#3-attachment-issues)
4. [SSE Connection Issues](#4-sse-connection-issues)
5. [Docker / Startup Issues](#5-docker--startup-issues)
6. [Print / Export Issues](#6-print--export-issues)
7. [Auth Issues](#7-auth-issues)

---

## 1. Timeline Issues

### Timeline not updating in real time

**Symptom:** The timeline shows existing events but does not update when another user submits, approves, or comments.

**Cause — SSE connection is not established**

Open the browser Network tab and look for a request to `/api/v1/timeline/stream/...`. If it is missing:
- The `TimelineSection` component is not mounted, or
- The SSE connection was closed immediately (check for an error event in the console).

**Cause — Token not passed correctly**

The `EventSource` connection is opened with a `?token=` query parameter. If the token is missing, expired, or malformed, the backend closes the connection immediately.

Check:
```
GET /api/v1/timeline/stream/ADJUSTMENT/<id>?token=<jwt>
```
The response status for a valid token is `200` with `Content-Type: text/event-stream`. A `401` or immediate close means the token failed verification.

**Cause — Proxy buffering**

If your reverse proxy buffers the response, `data:` events accumulate in the proxy buffer and are not delivered until the buffer flushes. Add `proxy_buffering off` on the stream path. See [deployment.md — SSE](deployment.md#5-sse-real-time-timeline).

---

### Edit or delete of a comment is not reflected in the timeline

**Symptom:** A comment is edited or deleted but other users' timelines do not update.

**Expected behavior — this is correct by design.**

Only comment **creation** emits an SSE event. Edits and deletes do not push SSE updates. The frontend compensates by calling a full timeline REST re-fetch (`refreshTimeline()`) after those operations. Other connected clients will see the change only on their next page load or timeline re-fetch.

If you need real-time propagation of edits and deletes, `CommentsService.editComment()` and `CommentsService.deleteComment()` would need to call `emitTimelineEvent()`.

---

### SYSTEM event is missing from the timeline

**Symptom:** A status transition (submit, approve, finalize) happened but no corresponding event appears in the timeline.

**Cause — AuditLog entry was not written**

SYSTEM timeline events are derived from `AuditLog` rows at read time. If the service function did not call `auditService.log()` after the status transition, no row exists and no event appears.

Check the `AuditLog` table for the entity:
```sql
SELECT * FROM AuditLog WHERE entityId = '<request-id>' ORDER BY timestamp ASC;
```

**Cause — before and after status are the same**

The `TimelineService` filters out `AuditLog` entries where `beforeSnapshot.status === afterSnapshot.status`. If the snapshot fields were not set correctly when calling `auditService.log()`, the entry is silently excluded.

**Cause — transfer approval action shows as `STATUS_CHANGE` in REST**

The `ORIGIN_MANAGER_APPROVED` and `READY_TO_FINALIZE` statuses are not in the `STATUS_TO_ACTION` map in `timeline.service.ts`. REST timeline responses for those transitions show `action: 'STATUS_CHANGE'` (fallback to `log.action`), while SSE events for the same transitions explicitly emit `action: 'APPROVE'`. This is a known inconsistency. Use `metadata.to` (the resulting status) as the reliable indicator of which transition occurred.

---

## 2. Stock Report Issues

### Wrong `startingQty`

**Symptom:** The Stock Opname report shows a `startingQty` that does not match expectations.

**How `startingQty` is calculated:**

```
startingQty = balanceAfter of the most recent StockLedger entry
              where createdAt < startDate (i.e., strictly before the period)
            = 0 if no such entry exists
```

Common misunderstandings:
- Entries on `startDate` itself are **not** included in `startingQty`. They become part of `inboundQty` or `outboundQty`.
- If a product was first added to the system on or after `startDate`, `startingQty` is `0`.
- `startingQty` can be negative if the ledger had a negative balance at the boundary (an edge case from manual corrections).

**Only finalized transactions appear in the ledger.** Pending, approved, cancelled, or rejected requests have no effect on any report quantity.

---

### `systemQty` differs from `StockBalance.onHandQty`

**Symptom:** The report's `systemQty` for a product does not match what the stock overview shows.

**This is expected for historical date ranges.** `systemQty` is computed from ledger history:

```
systemQty = startingQty + inboundQty - outboundQty
```

`StockBalance.onHandQty` reflects the **current live state**, not the state at the end of the report period. For a report covering a past period, these values will differ if stock changed after `endDate`.

Never use `StockBalance.onHandQty` as a substitute for `systemQty` in historical reports.

---

## 3. Attachment Issues

### Cannot delete an attachment — 403 Forbidden

**Symptom:** Clicking Delete on an attachment returns a 403 error.

**Authorization rule:** Only the original uploader (`uploadedById === userId`) or an admin (`isAdmin: true`) can delete an attachment. Any other user receives `403 FORBIDDEN_ERROR`.

The frontend hides the Delete button for users who are not the uploader or an admin. The backend enforces this independently — the frontend check is a UI convenience only.

**Fix:** Either delete as the uploading user, or as an admin account.

---

### Downloaded file returns 404

**Symptom:** Clicking a file attachment shows an error instead of opening the file.

**Cause:** Attachments are stored on the server filesystem. If the server was restarted without a persistent volume for the `uploads/` directory, the files are lost but the database records remain.

Check `backend/uploads/<entityType>/<requestId>/` for the file. If it is absent, the file cannot be recovered.

**Prevention:** Mount a persistent volume at the `uploads/` path in production. See [deployment.md — File Uploads](deployment.md#6-file-uploads).

---

## 4. SSE Connection Issues

### 401 on `/api/v1/timeline/stream/...`

**Symptom:** The SSE connection opens but immediately closes with a 401 status.

**Cause:** The `EventSource` browser API does not support custom request headers. The JWT must be passed as a query parameter, not in the `Authorization` header:

```
/api/v1/timeline/stream/:entityType/:entityId?token=<access_token>
```

If `?token=` is missing, empty, or expired, the backend closes the connection with 401. The SSE route performs its own token verification — it is not covered by the standard `authMiddleware`.

Check that `localStorage.getItem('access_token')` returns a valid, non-expired token in the browser.

---

### SSE connects but no events arrive

**Symptom:** The Network tab shows the SSE connection is open (status 200, `text/event-stream`), but no events appear when actions are taken.

**Check 1 — Entity type mismatch**

SSE subscribers are keyed by `"entityType:entityId"`. The `entityType` in the stream URL must exactly match the entity type used when events are emitted. Valid values: `ADJUSTMENT`, `TRANSFER`.

**Check 2 — emitTimelineEvent is not called**

If the service function that performed the action does not call `emitTimelineEvent()`, no SSE message is sent. Comment edits and deletes intentionally do not emit SSE — the frontend re-fetches the REST timeline instead.

**Check 3 — Process isolation**

SSE state is in memory. If the backend restarts or you are running multiple backend processes, subscribers from a previous process are gone. Reconnect the browser tab.

---

### SSE events stop arriving after a period of inactivity

**Symptom:** The SSE connection appears active but events stop being delivered after several minutes.

**Cause — Proxy timeout**

The backend sends a `: keep-alive` heartbeat comment every 15 seconds to prevent idle timeouts. If your proxy has a shorter `proxy_read_timeout`, it will close the connection first.

Set `proxy_read_timeout` to at least `3600s` on the stream path.

**Cause — Browser or OS network idle timeout**

Some environments close idle TCP connections. The 15-second heartbeat is designed to prevent this. If the problem persists, verify the heartbeat is reaching the client (look for `: keep-alive` lines in the Network tab response).

---

## 5. Docker / Startup Issues

### Backend exits immediately — "Missing required environment variables"

**Symptom:** `docker compose up` starts the backend container, which exits immediately with an error like `Missing required environment variables: DATABASE_URL, JWT_SECRET`.

**Cause:** `DATABASE_URL` and `JWT_SECRET` are validated at startup and are required. The `docker-compose.yml` sets these for local development. If you are overriding with a custom `.env` file or environment, ensure both variables are present.

---

### Prisma migration fails — "Can't reach database server"

**Symptom:** The backend container logs show a Prisma connection error during migration.

**Cause:** The backend started before MySQL was ready, or `DATABASE_URL` points to the wrong host.

The `docker-compose.yml` configures the backend to wait for the MySQL healthcheck (`condition: service_healthy`) before starting. The MySQL healthcheck runs `mysqladmin ping` with up to 10 retries at 10-second intervals. If MySQL does not become healthy within that window, the backend will fail.

**Fixes:**
- Wait for MySQL to fully initialize on first run (the initial data directory setup can take 30–60 seconds).
- Verify `DATABASE_URL` uses the Docker service name `mysql`, not `localhost`: `mysql://asset_user:asset_password@mysql:3306/asset_db`
- Restart just the backend after MySQL is healthy: `docker compose restart backend`

---

### Prisma migration fails — "Table already exists"

**Symptom:** `prisma migrate deploy` fails with an error about a table already existing.

**Cause:** The database contains tables that do not match the migration history. This can happen if the schema was applied manually or with `migrate dev` and then `migrate deploy` is run against the same database.

**Fix (development only):** Drop and recreate the database, then re-run migrations:

```bash
docker compose exec mysql mysql -u root -proot_password -e "DROP DATABASE asset_db; CREATE DATABASE asset_db;"
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npm run prisma:seed
```

> Never drop a production database.

---

### `npm install` not reflected after adding a package

**Symptom:** You added a package to `package.json` but the Docker container does not have it.

**Cause:** The `node_modules` directory inside the container is stored in an anonymous Docker volume (`/app/node_modules`). It is not re-installed on every `docker compose up`.

**Fix:** Rebuild the image so `npm install` runs inside the new layer:

```bash
docker compose build backend    # or frontend
docker compose up
```

Or, to also clear the volume:

```bash
docker compose down -v          # removes volumes including node_modules
docker compose up --build
```

---

### Uploaded files not found after container restart

**Symptom:** Previously uploaded attachments return 404 after restarting Docker.

**Cause:** The `uploads/` directory is inside the container's filesystem. Without a named volume, it is recreated empty on restart.

**Fix:** Add a named volume for uploads in `docker-compose.yml`. See [deployment.md — File Uploads](deployment.md#6-file-uploads).

---

## 6. Print / Export Issues

### Print page is blank

**Symptom:** Clicking Print opens the browser print dialog, but the preview shows a blank page.

**Cause 1 — `#print-area` is inside a hidden element**

If the report preview has not been loaded yet (no data fetched), the `#print-area` container may be empty or hidden. Always click **Preview** and confirm the report renders before clicking **Print**.

**Cause 2 — `display: none` on a parent element**

`@media print` rules hide modal chrome (filters, buttons) by setting `display: none`. If those rules also hide a parent element that wraps `#print-area`, the print content will be empty. Check the `@media print` CSS to ensure `#print-area` itself is not inside a hidden ancestor.

---

### Print layout is broken or truncated

**Symptom:** The printed report shows garbled layout — columns misaligned, content cut off, or modal chrome visible on the print.

**Cause 1 — `@media print` rules are missing or overridden**

The print layout depends on CSS rules in the `@media print` block. Inline styles applied by MUI components may override print CSS. Inspect the printed element with `@media print` simulation in the browser devtools (in Chrome: Rendering tab → Emulate CSS media → print).

**Cause 2 — Browser zoom level**

Browser zoom affects print layout. Reset zoom to 100% (`Ctrl+0`) before printing.

**Cause 3 — Paper size and margins**

Use the browser print dialog to set margins and paper size. The report is designed for A4 landscape at default margins.

---

## 7. Auth Issues

### All API requests return 401 after a period of inactivity

**Symptom:** After some time away, every request fails with 401 and the page redirects to `/login`.

**Expected behavior.** The access token has a 15-minute TTL (`JWT_EXPIRES_IN: 15m`). The frontend response interceptor (`frontend/src/api/client.ts`) automatically redirects to `/login` on 401, unless the failing request was itself a login or refresh call.

The frontend does not currently auto-refresh tokens transparently on expiry — a 401 triggers logout. If you need longer sessions without re-login, increase `JWT_EXPIRES_IN` (or implement silent refresh in the frontend interceptor).

---

### Login succeeds but data is empty — user sees no locations or requests

**Symptom:** A non-admin user logs in, the dashboard shows all zeros, and the stock overview is empty.

**Cause:** The user has no `UserLocationRole` assignments. Non-admin users are scoped to the locations they are assigned to. Without assignments, all location-filtered queries return nothing.

**Fix:** Assign the user to at least one location via the admin Users page, or run the seed script to populate the demo users who already have assignments.
