# Request Lifecycle

This document describes the internal lifecycle of **Adjustment** and **Transfer** requests in the inventory system. It is intended for engineers working on backend logic, workflow transitions, stock integrity, and timeline/audit features.

> **Critical invariant:** Stock quantities (`onHandQty`) are modified **only at finalization**. No earlier step — including approval — changes actual stock levels.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Adjustment Lifecycle](#2-adjustment-lifecycle)
3. [Transfer Lifecycle](#3-transfer-lifecycle)
4. [State Transition Rules](#4-state-transition-rules)
5. [Side Effects Per Step](#5-side-effects-per-step)
6. [Cancellation Behavior](#6-cancellation-behavior)
7. [Timeline and Audit Trail](#7-timeline-and-audit-trail)

---

## 1. Overview

The system supports two types of inventory requests:

| Type | Purpose | Involves Reservations? | Approval Steps |
|------|---------|----------------------|----------------|
| **Adjustment** | Increase or decrease stock at a single location | No | 1 (Manager approval) |
| **Transfer** | Transfer stock from one location to another | Yes | 2 (Origin Manager + Destination participant) |

Both workflows follow a strict state machine where **each transition is atomic** — the status update and any associated side effects (reservations, stock mutations, ledger entries) are committed together in a single database transaction. If any step fails, the entire operation rolls back and the status remains unchanged.

Availability of stock is computed as:

```
availableQty = onHandQty - sum(ACTIVE reservations)
```

This prevents double-allocation across concurrent requests.

---

## 2. Adjustment Lifecycle

### 2.1 Status Flow

```
DRAFT → SUBMITTED → APPROVED → FINALIZED
                  ↘ REJECTED
  (any non-terminal) → CANCELLED
```

### 2.2 Step-by-Step Transitions

#### DRAFT (initial state)

- **Who creates it:** Any user with access to the target location.
- **What happens internally:**
  - A new request record is created with an empty items list.
  - A unique request number is generated (`ADJ-YYYYMMDD-LOCCODE-XXXX`).
  - The location is validated as active at creation time.
- **Stock:** No change.
- **Reservations:** None created.
- **Ledger:** No entries.

---

#### DRAFT → SUBMITTED

- **Who acts:** The request creator only.
- **Preconditions:**
  - Request must have at least one item.
  - All item locations must be active.
- **What happens internally:**
  - Status atomically transitions to `SUBMITTED`.
  - A non-blocking warning is emitted if no active Managers exist at the item location(s) to perform the next approval — the transition still proceeds.
  - An `AuditLog` entry is written (`action: STATUS_CHANGE`, `beforeSnapshot: {status: 'DRAFT'}`, `afterSnapshot: {status: 'SUBMITTED'}`).
  - An SSE timeline event is emitted (`action: 'SUBMIT'`).
- **Stock:** No change.
- **Reservations:** None.
- **Ledger:** No entries.

---

#### SUBMITTED → APPROVED

- **Who acts:** A **Manager** at any item location, or an Admin.
- **Preconditions:**
  - Request must be in `SUBMITTED` status.
  - User must have access to at least one of the item locations.
  - All item locations must be active.
  - For items with a **negative** quantity change (stock reduction): available stock must be sufficient at approval time (`availableQty + qtyChange >= 0`). This is a soft check — stock is not yet reserved, so final validation is re-enforced at finalization.
- **What happens internally:**
  - Status atomically transitions to `APPROVED`.
  - Approver identity and timestamp are recorded.
  - An `AuditLog` entry is written with item snapshot metadata.
  - An SSE timeline event is emitted (`action: 'APPROVE'`).
- **Stock:** No change.
- **Reservations:** None. Adjustments do not use the reservation system.
- **Ledger:** No entries.

> **Note:** Operators cannot approve adjustments. Only Managers and Admins can.

---

#### APPROVED → FINALIZED

- **Who acts:** An **Operator** or **Manager** at any item location, or an Admin.
- **Preconditions:**
  - Request must be in `APPROVED` status.
  - All item locations must be active.
  - At least one eligible user (Operator or Manager) must exist at the item locations — this is a hard block.
  - All items must still be active — this is a hard block.
  - Sufficient available stock must exist for negative quantity changes — re-validated inside the transaction with a row-level lock.
- **What happens internally (within a single transaction):**
  1. Status is atomically claimed: `updateMany({ where: { id, status: APPROVED }, data: { status: FINALIZED, finalizedById, finalizedAt } })`. If another process already finalized it, `count = 0` and the operation aborts.
  2. For each item, a row-level lock is acquired on the `StockBalance` row (`SELECT FOR UPDATE`).
  3. Available stock is re-validated: `available = onHandQty - reservedQty; if (available + qtyChange < 0) throw error`.
  4. `onHandQty` is updated by `qtyChange` (positive or negative).
  5. A ledger entry is created with `sourceType: ADJUSTMENT`.
  - After the transaction: an `AuditLog` entry is written and an SSE timeline event is emitted (`action: 'FINALIZE'`).
- **Stock:** **CHANGED.** This is the only point where stock is modified for adjustments.
- **Reservations:** Not applicable — adjustments never create reservations.
- **Ledger:** One entry per item, recording `changeQty` and `balanceAfter`.

> **`finalizedAt`** is the timestamp recorded on the request record when the finalization transaction commits. This is the authoritative point at which stock changes for audit and reporting purposes.

---

#### SUBMITTED → REJECTED

- **Who acts:** A **Manager** at any item location, or an Admin.
- **Preconditions:**
  - Request must be in `SUBMITTED` status (cannot reject an already-approved request).
  - A rejection reason must be provided.
  - User must have access to at least one item location.
- **What happens internally:**
  - Status atomically transitions to `REJECTED` with reason, actor, and timestamp recorded.
  - An `AuditLog` entry is written and an SSE timeline event is emitted (`action: 'REJECT'`).
- **Stock:** No change.
- **Reservations:** None to release (adjustments don't reserve stock).
- **Ledger:** No entries.

---

### 2.3 Adjustment Role Summary

| Action | Operator | Manager | Admin |
|--------|----------|---------|-------|
| Create | ✓ | ✓ | ✓ |
| Submit | ✓ (creator only) | ✓ (creator only) | ✓ (creator only) |
| Approve | ✗ | ✓ (at item location) | ✓ |
| Reject | ✗ | ✓ (at item location) | ✓ |
| Finalize | ✓ (at item location) | ✓ (at item location) | ✓ |
| Cancel | ✓ (creator only) | ✓ (creator, or Manager at item location) | ✓ |

---

## 3. Transfer Lifecycle

A transfer moves stock from an **origin** (source) location to a **destination** location. It requires approval from both sides before finalization.

### 3.1 Status Flow

```
DRAFT → SUBMITTED → ORIGIN_MANAGER_APPROVED → READY_TO_FINALIZE → FINALIZED
                  ↘ REJECTED                ↘ REJECTED
  (SUBMITTED, ORIGIN_MANAGER_APPROVED, or READY_TO_FINALIZE) → CANCELLED
```

### 3.2 Step-by-Step Transitions

#### DRAFT (initial state)

- **Who creates it:** Any user with access to the origin (source) location.
- **What happens internally:**
  - A new request record is created with an empty items list.
  - A unique request number is generated (`TRF-YYYYMMDD-SRCCODE-DSTCODE-XXXX`).
  - Origin and destination must be different locations, both active — this is a hard block.
  - A non-blocking warning is emitted if the destination has no eligible users.
  - An `AuditLog` entry is written (`action: TRANSFER_CREATE`).
- **Stock:** No change.
- **Reservations:** None.
- **Ledger:** No entries.

---

#### DRAFT → SUBMITTED

- **Who acts:** The request creator only.
- **Preconditions:**
  - Request must have at least one item.
  - User must have access to the origin location.
  - All items must have sufficient available stock at the origin (`availableQty >= qty`). This is checked at submit time — stock is not yet reserved.
  - A non-blocking warning is emitted if the origin location has no Manager available to approve.
- **What happens internally:**
  - Status atomically transitions to `SUBMITTED`.
  - An `AuditLog` entry is written and an SSE timeline event is emitted (`action: 'SUBMIT'`).
- **Stock:** No change.
- **Reservations:** None created yet.
- **Ledger:** No entries.

---

#### SUBMITTED → ORIGIN_MANAGER_APPROVED

- **Who acts:** A **Manager at the origin location**, or an Admin.
- **Preconditions:**
  - Request must be in `SUBMITTED` status.
  - User must be a Manager at the origin location (Operators cannot perform this step).
  - Origin location must be active.
- **What happens internally (within a single transaction):**
  1. Status is atomically claimed to `ORIGIN_MANAGER_APPROVED`.
  2. For each item, a **stock reservation** is created at the origin location:
     - A `StockReservation` record is inserted with `status: ACTIVE`.
     - `StockBalance.reservedQty` cache is incremented.
     - A row-level lock (`SELECT FOR UPDATE`) is acquired on the balance row to prevent concurrent over-reservation.
     - Available stock is validated: `onHandQty - existingActiveReservations >= qty`.
  - After the transaction: an `AuditLog` entry is written and an SSE timeline event is emitted (`action: 'APPROVE'`).
- **Stock (`onHandQty`):** No change.
- **Reservations:** **CREATED.** Active reservations are placed at the origin location for each item.
- **Ledger:** No entries.

> **Why reservations are created here:** Once the origin Manager approves, the stock is effectively committed. Reservations prevent other requests from double-allocating the same units while the destination still needs to approve.

---

#### ORIGIN_MANAGER_APPROVED → READY_TO_FINALIZE

- **Who acts:** Any user with access to the **destination location** (Operator or Manager), or an Admin.
- **Preconditions:**
  - Request must be in `ORIGIN_MANAGER_APPROVED` status.
  - User must have access to the destination location.
  - Destination location must be active.
- **What happens internally:**
  - Status atomically transitions to `READY_TO_FINALIZE`.
  - Destination approver identity and timestamp are recorded.
  - An `AuditLog` entry is written and an SSE timeline event is emitted (`action: 'APPROVE'`).
- **Stock:** No change.
- **Reservations:** Unchanged. Existing reservations at the origin remain `ACTIVE`.
- **Ledger:** No entries.

---

#### READY_TO_FINALIZE → FINALIZED

- **Who acts:** Any user with access to the **destination location** (Operator or Manager), or an Admin.
- **Preconditions:**
  - Request must be in `READY_TO_FINALIZE` status.
  - Both origin and destination locations must be active.
  - At least one eligible user (Operator or Manager) must exist at the destination location — this is a hard block.
  - All items must be registered (active) at the destination location — this is a hard block.
  - A non-blocking warning is emitted if an item is no longer active at the origin.
- **What happens internally (within a single transaction):**
  1. Status is atomically claimed to `FINALIZED` with `finalizedAt` timestamp.
  2. Active reservations at the origin are marked `CONSUMED` via `consumeTransferReservationWithinTx`. If no `ACTIVE` reservations are found, the transaction aborts.
  3. For each item at the **origin** location:
     - `onHandQty` is decremented by `qty`.
     - `reservedQty` is decremented by `qty` (releasing the reservation cache).
     - A ledger entry is created with `sourceType: TRANSFER_OUT`.
  4. For each item at the **destination** location:
     - A `StockBalance` row is created (upserted) if it does not exist.
     - `onHandQty` is incremented by `qty`.
     - A ledger entry is created with `sourceType: TRANSFER_IN`.
  - After the transaction: an `AuditLog` entry is written and an SSE timeline event is emitted (`action: 'FINALIZE'`).
- **Stock:** **CHANGED.** Origin `onHandQty` is decremented; destination `onHandQty` is incremented.
- **Reservations:** **CONSUMED.** All `ACTIVE` reservations for this request transition to `CONSUMED`.
- **Ledger:** One `TRANSFER_OUT` entry per item at origin; one `TRANSFER_IN` entry per item at destination.

> **`finalizedAt`** is the timestamp recorded on the request record when this transaction commits. It is the authoritative point at which stock changes for audit and reporting purposes.

---

#### SUBMITTED → REJECTED (origin rejection)

- **Who acts:** A **Manager at the origin location**, or an Admin.
- **Preconditions:**
  - Request must be in `SUBMITTED` status.
  - Rejection reason required.
- **What happens internally:**
  - Status atomically transitions to `REJECTED`.
  - An `AuditLog` entry is written and an SSE timeline event is emitted (`action: 'REJECT'`).
- **Stock:** No change.
- **Reservations:** None to release (reservations are created only at `ORIGIN_MANAGER_APPROVED`).
- **Ledger:** No entries.

---

#### ORIGIN_MANAGER_APPROVED → REJECTED (destination rejection)

- **Who acts:** Any user with access to the destination location, or an Admin.
- **Preconditions:**
  - Request must be in `ORIGIN_MANAGER_APPROVED` status.
  - Rejection reason required.
- **What happens internally (within a single transaction):**
  1. Status is atomically claimed to `REJECTED`.
  2. All `ACTIVE` reservations for this request are marked `RELEASED`.
  3. `StockBalance.reservedQty` cache is decremented at the origin for each released reservation.
  - After the transaction: an `AuditLog` entry is written and an SSE timeline event is emitted (`action: 'REJECT'`).
- **Stock:** No change.
- **Reservations:** **RELEASED.** Stock is made available again at the origin.
- **Ledger:** No entries.

---

### 3.3 Transfer Role Summary

| Action | Operator | Manager | Admin |
|--------|----------|---------|-------|
| Create | ✓ (origin access) | ✓ (origin access) | ✓ |
| Submit | ✓ (creator only) | ✓ (creator only) | ✓ (creator only) |
| Approve — Origin | ✗ | ✓ (Manager at origin) | ✓ |
| Approve — Destination | ✓ (at destination) | ✓ (at destination) | ✓ |
| Finalize | ✓ (at destination) | ✓ (at destination) | ✓ |
| Reject (from SUBMITTED) | ✗ | ✓ (Manager at origin) | ✓ |
| Reject (from ORIGIN_MANAGER_APPROVED) | ✓ (at destination) | ✓ (at destination) | ✓ |
| Cancel | ✓ (creator or location participant) | ✓ (creator or location participant) | ✓ |

---

## 4. State Transition Rules

### 4.1 Allowed Transitions

#### Adjustments

| From | To | Allowed By |
|------|----|-----------|
| `DRAFT` | `SUBMITTED` | Creator |
| `SUBMITTED` | `APPROVED` | Manager at item location, Admin |
| `SUBMITTED` | `REJECTED` | Manager at item location, Admin |
| `APPROVED` | `FINALIZED` | Operator/Manager at item location, Admin |
| `DRAFT` | _(deleted)_ | Creator |
| `SUBMITTED` | `CANCELLED` | Creator, Manager at item location, Admin |
| `APPROVED` | `CANCELLED` | Creator, Manager at item location, Admin |

#### Transfers

| From | To | Allowed By |
|------|----|-----------|
| `DRAFT` | `SUBMITTED` | Creator |
| `SUBMITTED` | `ORIGIN_MANAGER_APPROVED` | Manager at origin, Admin |
| `SUBMITTED` | `REJECTED` | Manager at origin, Admin |
| `ORIGIN_MANAGER_APPROVED` | `READY_TO_FINALIZE` | Operator/Manager at destination, Admin |
| `ORIGIN_MANAGER_APPROVED` | `REJECTED` | Any user at destination, Admin |
| `READY_TO_FINALIZE` | `FINALIZED` | Operator/Manager at destination, Admin |
| `SUBMITTED` | `CANCELLED` | Creator, location participant, Admin |
| `ORIGIN_MANAGER_APPROVED` | `CANCELLED` | Creator, location participant, Admin |
| `READY_TO_FINALIZE` | `CANCELLED` | Creator, location participant, Admin |

### 4.2 Blocked / Invalid Transitions

The following are explicitly **not permitted**:

- **Skipping steps** — e.g., `SUBMITTED → FINALIZED` directly is not allowed.
- **Backwards transitions** — once a request moves forward, it cannot revert to a previous status.
- **Acting on terminal states** — `FINALIZED`, `REJECTED`, and `CANCELLED` are terminal. No further transitions are possible.
- **Re-cancelling or re-rejecting** — already-cancelled or already-rejected requests cannot be cancelled or rejected again.
- **Cancelling a DRAFT** — DRAFT transfers must be deleted, not cancelled.
- **Cancelling a FINALIZED request** — finalization is permanent; stock cannot be reversed through cancellation.
- **Operators approving adjustments** — the adjustment approval step requires Manager or Admin authority.
- **Non-origin Managers approving the origin step** — only a Manager explicitly assigned to the origin location (or an Admin) may grant origin approval on a transfer.
- **Concurrent finalization** — atomic `updateMany` with status precondition prevents two processes from finalizing the same request simultaneously. The second attempt will receive `count = 0` and abort.

---

## 5. Side Effects Per Step

This section is the definitive reference for what each transition actually does to the database.

### 5.1 Reservation Behavior

Reservations apply **only to transfers**, not adjustments.

| Event | Reservation Effect |
|-------|--------------------|
| Transfer reaches `ORIGIN_MANAGER_APPROVED` | Reservations **CREATED** (`ACTIVE`) at origin for each item |
| Transfer reaches `READY_TO_FINALIZE` | No change — reservations remain `ACTIVE` |
| Transfer reaches `FINALIZED` | Reservations **CONSUMED** — marked `CONSUMED`, stock decremented at origin |
| Transfer **REJECTED** from `ORIGIN_MANAGER_APPROVED` | Reservations **RELEASED** — stock made available again |
| Transfer **CANCELLED** from any reserved status | Reservations **RELEASED** — stock made available again |

Adjustment requests never create reservations. Stock availability for adjustments is validated at approval time and re-validated under lock at finalization.

#### Available Stock Formula

```
availableQty = onHandQty - sum(qty WHERE reservations.status = ACTIVE)
```

The `StockBalance.reservedQty` column is a **cache** updated synchronously with reservation operations. The authoritative source of truth for availability is the live sum from the `StockReservation` table.

### 5.2 Stock Changes

> **Stock (`onHandQty`) changes ONLY at finalization — for both adjustments and transfers.**

| Request Type | Event | Origin `onHandQty` | Destination `onHandQty` |
|-------------|-------|--------------------|------------------------|
| Adjustment | `APPROVED → FINALIZED` | `+= qtyChange` (signed) | N/A |
| Transfer | `READY_TO_FINALIZE → FINALIZED` | `-= qty` | `+= qty` |

No earlier step — including approval, origin manager approval, or destination approval — modifies `onHandQty`.

For transfers at finalization:
- Origin `reservedQty` is also decremented (the reservation consumed).
- Destination `StockBalance` row is created (upserted) if it does not yet exist.

### 5.3 Ledger Entries

Ledger entries are immutable audit records. They are created **only at finalization**, alongside the stock mutations, within the same transaction.

| Source Type | When Created | Location | `changeQty` |
|-------------|-------------|----------|-------------|
| `ADJUSTMENT` | Adjustment finalized | Item location | Signed `qtyChange` (positive or negative) |
| `TRANSFER_OUT` | Transfer finalized | Origin | Negative — units leaving |
| `TRANSFER_IN` | Transfer finalized | Destination | Positive — units arriving |

Each ledger entry records:
- `productId`, `locationId`
- `changeQty` — the signed delta applied
- `balanceAfter` — snapshot of `onHandQty` immediately after the change
- `sourceType` and `sourceId` — links back to the originating request

No ledger entries are created for approval steps, rejection, or cancellation.

---

## 6. Cancellation Behavior

### 6.1 Adjustment Cancellation

**Who can cancel:**
- The request creator at any non-terminal status.
- A Manager at any item location when the request is `SUBMITTED` or `APPROVED`.
- An Admin at any non-terminal status.

**Cancellable statuses:** `DRAFT`, `SUBMITTED`, `APPROVED`

**What happens:**
- Status transitions to `CANCELLED` with reason, actor, and timestamp recorded.
- An `AuditLog` entry is written and an SSE timeline event is emitted (`action: 'CANCEL'`).
- No stock is changed.
- No ledger entries are created.
- No reservations exist to release (adjustments have none).

**What is blocked:**
- Cannot cancel a `FINALIZED` request — the stock change is permanent.
- Cannot cancel an already `CANCELLED` or `REJECTED` request.

> Cancellation of a finalized adjustment does **not** reverse the stock change. To correct finalized stock, a new adjustment request must be created.

---

### 6.2 Transfer Cancellation

**Who can cancel:**
- The request creator at any cancellable status.
- Any user with access to the origin or destination location.
- An Admin.

**Cancellable statuses:** `SUBMITTED`, `ORIGIN_MANAGER_APPROVED`, `READY_TO_FINALIZE`

> DRAFT transfers cannot be "cancelled" — they must be **deleted**.

**What happens (within a single transaction):**
1. Status atomically transitions to `CANCELLED` with reason, actor, and timestamp.
2. If the request was in a **reserved state** (`ORIGIN_MANAGER_APPROVED` or `READY_TO_FINALIZE`):
   - All `ACTIVE` reservations for this request are marked `RELEASED`.
   - `StockBalance.reservedQty` cache is decremented at the origin.
3. If the request was still in `SUBMITTED` (not yet reserved), no reservation cleanup is needed.
- After the transaction: an `AuditLog` entry is written and an SSE timeline event is emitted (`action: 'CANCEL'`).

**Stock impact:** None. Since stock only changes at finalization, cancelling a pre-finalized request has zero stock impact.

**Ledger impact:** None.

**What is blocked:**
- Cannot cancel a `FINALIZED` transfer — the transfer is permanent.
- Cannot cancel an already `CANCELLED` or `REJECTED` transfer.
- Cannot cancel a `DRAFT` transfer (use delete instead).

---

### 6.3 Summary: When Reservations Are Released

| Scenario | Reservations Released? |
|----------|----------------------|
| Transfer cancelled from `SUBMITTED` | No (none were created) |
| Transfer cancelled from `ORIGIN_MANAGER_APPROVED` | **Yes** |
| Transfer cancelled from `READY_TO_FINALIZE` | **Yes** |
| Transfer rejected from `SUBMITTED` | No (none were created) |
| Transfer rejected from `ORIGIN_MANAGER_APPROVED` | **Yes** |
| Transfer finalized | No — reservations are **consumed**, not released |

Reservation release restores `availableQty` to what it was before origin approval, allowing other requests to allocate that stock.

---

## 7. Timeline and Audit Trail

### 7.1 Overview

Every request exposes a unified **timeline** — a chronologically ordered sequence of events that describes its complete history. The timeline is **derived at read time**, not stored as a separate table.

### 7.2 AuditLog — The Record of Status Transitions

Every status mutation writes an `AuditLog` entry via `auditService.log()`. The relevant fields for timeline reconstruction are:

| Field | Type | Content for status changes |
|-------|------|---------------------------|
| `entityType` | string | `STOCK_ADJUSTMENT_REQUEST` or `STOCK_TRANSFER_REQUEST` |
| `entityId` | string | The request UUID |
| `action` | string | `STATUS_CHANGE` for workflow transitions |
| `beforeSnapshot` | JSON | Previous state, e.g. `{ status: 'SUBMITTED' }` |
| `afterSnapshot` | JSON | New state, e.g. `{ status: 'APPROVED', itemSnapshot: [...] }` |
| `userId` | string | The user who performed the action |
| `timestamp` | DateTime | When the event occurred |

> **Note on field naming:** The codebase uses `beforeValue`/`afterValue` as legacy aliases when calling `auditService.log()`. The service normalizes these to `beforeSnapshot`/`afterSnapshot` before writing to the database. The timeline service reads both field names for backward compatibility.

### 7.3 How Timeline Events Are Derived

The `TimelineService.getTimeline()` method aggregates three sources:

#### SYSTEM events (from AuditLog)

For each `AuditLog` record for the entity, the service:
1. Parses `beforeSnapshot` and `afterSnapshot` (with fallback to `beforeValue`/`afterValue`).
2. Extracts `beforeStatus` and `afterStatus`.
3. **Filters out entries where the status did not change** (`beforeStatus === afterStatus` → excluded).
4. Maps `afterStatus` to a human-readable action using:

```typescript
const STATUS_TO_ACTION = {
  DRAFT:     'DRAFT',
  SUBMITTED: 'SUBMIT',
  APPROVED:  'APPROVE',
  REJECTED:  'REJECT',
  CANCELLED: 'CANCEL',
  FINALIZED: 'FINALIZE',
};
```

5. Returns events with `type: 'SYSTEM'`, the mapped `action`, user info, and `metadata: { from, to, rawAction }`.

#### COMMENT events (from Comment table)

- Fetched via `commentRepository.findByEntity(entityType, entityId)`.
- Each comment becomes a `type: 'COMMENT'` event with `action: 'COMMENT'`.
- Soft-deleted comments (`isDeleted: true`) are included in the timeline but their `content` is set to `null`.
- `metadata` includes `content`, `editedAt` (if edited), `isDeleted`, and `editCount`.

#### ATTACHMENT events (from Attachment table)

- Fetched via `attachmentRepository.findByEntity(entityType, entityId)`.
- Each attachment becomes a `type: 'ATTACHMENT'` event with `action: 'UPLOAD'`.
- `metadata` includes `fileName`, `filePath`, and `description`.

#### Merging and sorting

All three event arrays are merged and sorted **ascending by `timestamp`**. This produces a complete chronological history of the request.

### 7.4 What Triggers SSE Events

`emitTimelineEvent()` is called immediately after every successful mutation. The following backend operations emit SSE events:

| Operation | Entity type | SSE `action` |
|-----------|-------------|-------------|
| Adjustment submit | `ADJUSTMENT` | `SUBMIT` |
| Adjustment approve | `ADJUSTMENT` | `APPROVE` |
| Adjustment reject | `ADJUSTMENT` | `REJECT` |
| Adjustment finalize | `ADJUSTMENT` | `FINALIZE` |
| Adjustment cancel | `ADJUSTMENT` | `CANCEL` |
| Transfer submit | `TRANSFER` | `SUBMIT` |
| Transfer approve origin | `TRANSFER` | `APPROVE` |
| Transfer approve destination | `TRANSFER` | `APPROVE` |
| Transfer reject | `TRANSFER` | `REJECT` |
| Transfer finalize | `TRANSFER` | `FINALIZE` |
| Transfer cancel | `TRANSFER` | `CANCEL` |

Comment create/edit/delete and attachment upload/delete also emit timeline events — see the comments and attachments modules respectively.

### 7.5 SSE Connection Lifecycle

The SSE endpoint maintains an in-memory registry of connected clients keyed by `"entityType:entityId"` (e.g., `"ADJUSTMENT:uuid-123"`). When `emitTimelineEvent` is called, it writes to all subscribers for that key.

- **Heartbeat:** The server sends a `: keep-alive` comment every 15 seconds to prevent proxy timeouts.
- **Disconnect:** The client registry is cleaned up when the HTTP connection closes (`req.on('close', ...)`).
- **Authentication:** The SSE endpoint validates a JWT passed as the `?token=` query parameter. The standard `Authorization` header is not used because the browser `EventSource` API does not support custom headers. The token is verified using the same `authService.verifyAccessToken()` method used by regular middleware.

### 7.6 Timeline Design Invariants

- **Timeline is append-only from an audit perspective.** `AuditLog` entries are never updated or deleted.
- **Deleted comments appear in the timeline** with `content: null` and `isDeleted: true`. They are not hidden, ensuring the event sequence is complete.
- **Status derivation, not action string matching.** SYSTEM events are identified by comparing `beforeStatus` and `afterStatus` in the snapshot — not by matching the `action` field string. This makes the timeline robust against future changes to action naming conventions.
- **`finalizedAt` marks the stock change point.** The `finalizedAt` timestamp on the request record is when stock actually changed. It should be used (not `createdAt`) when referencing the moment of stock impact in reports or audit queries.
