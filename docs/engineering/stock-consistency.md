# Stock Consistency Rules

This document defines the integrity rules that govern stock state in the inventory system. These rules are not optional conventions — violating any of them breaks stock correctness in ways that may be silent, difficult to detect, and impossible to reverse without manual intervention.

> Engineers modifying stock-adjacent code must read this document before making changes.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Stock Model](#2-stock-model)
3. [Stock Change Rules](#3-stock-change-rules)
4. [Reservation Rules](#4-reservation-rules)
5. [Ledger Rules](#5-ledger-rules)
6. [Transaction Requirements](#6-transaction-requirements)
7. [Common Failure Scenarios](#7-common-failure-scenarios)
8. [Why These Rules Exist](#8-why-these-rules-exist)

---

## 1. Overview

Stock state is maintained across three tables that serve distinct purposes:

| Table | Role | Mutable? |
|-------|------|----------|
| `StockBalance` | Current live state per product-location | Yes — updated on every stock event |
| `StockLedger` | Immutable history of every stock change | **Never** — append-only |
| `StockReservation` | Pending claims on stock not yet consumed | Yes — status transitions only |

These three tables must stay consistent with each other at all times. Consistency is enforced by combining **row-level locks**, **atomic transactions**, and **status-gated preconditions**. No single rule is sufficient on its own — all must hold simultaneously.

---

## 2. Stock Model

### 2.1 StockBalance — Live State

`StockBalance` holds one row per `(productId, locationId)` pair. It is the read surface for all availability calculations.

| Field | Type | Meaning |
|-------|------|---------|
| `onHandQty` | Decimal(15,4) | Actual physical quantity present at this location |
| `reservedQty` | Decimal(15,4) | **Cache** — denormalized sum of `ACTIVE` reservation quantities |

**`onHandQty` is the authoritative quantity.** It changes only when stock physically moves — on finalization of an adjustment or movement.

**`reservedQty` is a cache**, not a source of truth. Its authoritative value is:

```sql
SELECT SUM(qty) FROM StockReservation
WHERE productId = ? AND locationId = ?
  AND status = 'ACTIVE'
```

The cache must be kept in sync via `stockBalanceRepository.reserve()` (on reservation creation) and `stockBalanceRepository.release()` (on reservation release or consumption). If these fall out of sync, availability calculations will be wrong but `onHandQty` will still be correct.

#### Available Stock Formula

```
availableQty = onHandQty - reservedQty
```

This is the quantity that can be safely allocated to new requests. Availability checks always use this formula, not `onHandQty` alone.

**Example:**
```
onHandQty   = 100
reservedQty =  30   (30 units committed to an in-progress movement)
availableQty = 70   (only these can be given to new requests)
```

Attempting to allocate 80 units here would succeed the raw `onHandQty` check but violate the reservation — this is the exact bug the `reservedQty` field prevents.

### 2.2 StockLedger — Immutable History

`StockLedger` is an append-only audit log. Every stock change produces one or more ledger entries recording what happened, when, and why.

| Field | Type | Meaning |
|-------|------|---------|
| `changeQty` | Decimal(15,4) | Signed delta — positive for inbound, negative for outbound |
| `balanceAfter` | Decimal(15,4) | Snapshot of `onHandQty` immediately after this change |
| `sourceType` | Enum | Which kind of operation caused this entry |
| `sourceId` | String | ID of the originating request |
| `createdAt` | DateTime | When the change occurred |

**`sourceType` values:**

| Value | When Created |
|-------|-------------|
| `ADJUSTMENT` | Adjustment request finalized |
| `TRANSFER_OUT` | Movement finalized — units leaving origin |
| `TRANSFER_IN` | Movement finalized — units arriving at destination |
| `MOVEMENT_OUT` | Direct movement out (future use) |
| `MOVEMENT_IN` | Direct movement in (future use) |
| `SEED` | Initial stock seeding |

The ledger is the ground truth for historical stock reconstruction. `balanceAfter` on the latest ledger entry for a location should always match its current `onHandQty`. If they diverge, the balance has been corrupted.

### 2.3 StockReservation — Pending Claims

`StockReservation` tracks stock that has been logically committed to a request but not yet physically moved.

| Field | Type | Meaning |
|-------|------|---------|
| `qty` | Decimal(15,4) | Units reserved |
| `sourceType` | Enum | `TRANSFER` or `ADJUSTMENT` |
| `sourceId` | String | ID of the originating request |
| `sourceItemId` | String | ID of the specific item within that request |
| `status` | Enum | `ACTIVE`, `RELEASED`, or `CONSUMED` |

**Reservation status lifecycle:**

```
ACTIVE ──► RELEASED   (request cancelled or rejected before finalization)
ACTIVE ──► CONSUMED   (request finalized — stock physically moved)
```

`RELEASED` and `CONSUMED` are terminal. A reservation never transitions backwards.

Only `ACTIVE` reservations count toward `reservedQty`. `RELEASED` and `CONSUMED` reservations have no effect on availability — they are retained solely for audit purposes.

---

## 3. Stock Change Rules

### Rule 1 — Stock changes only at finalization

`onHandQty` is incremented or decremented **only when a request reaches `FINALIZED` status**. No earlier workflow step — not submission, not approval, not reservation — modifies `onHandQty`.

This applies to both request types:

| Request Type | `onHandQty` changes when |
|-------------|--------------------------|
| Adjustment | `APPROVED → FINALIZED` |
| Movement | `DESTINATION_OPERATOR_APPROVED → FINALIZED` |

Any code that mutates `onHandQty` outside of finalization is a bug.

### Rule 2 — Stock changes must be validated under lock

Before modifying `onHandQty`, the system must:

1. Ensure the `StockBalance` row exists (upsert to zero if missing).
2. Acquire a **row-level lock** via `SELECT FOR UPDATE` on that row.
3. Re-read `onHandQty` and `reservedQty` from the locked row.
4. Validate that the change will not produce a negative available quantity:
   ```
   available = onHandQty - reservedQty
   if (available + qtyChange < 0) → throw ValidationError
   ```
5. Apply the mutation.
6. Write the ledger entry.

Steps 1–6 must execute within the same transaction. Splitting them across transactions removes the atomicity guarantee.

### Rule 3 — Positive-quantity changes do not require availability checks

Adding stock (positive `qtyChange`, `TRANSFER_IN`) cannot underflow. Availability validation is skipped for inbound-only operations. The upsert + lock + ledger steps still apply.

### Rule 4 — `onHandQty` must never go negative

`onHandQty` represents a physical count. A negative value has no meaningful interpretation and indicates a logic error. The availability check in Rule 2 prevents this. If `onHandQty` is ever observed to be negative in production, treat it as data corruption requiring investigation before any further mutations to that row.

### Rule 5 — A ledger entry must accompany every `onHandQty` change

Every successful mutation to `onHandQty` must produce a corresponding `StockLedger` entry within the same transaction. There is no valid case where stock changes without a ledger record. The ledger entry and the balance mutation are committed together or not at all.

---

## 4. Reservation Rules

Reservations currently apply only to **movement requests** (type `TRANSFER`). Adjustment requests do not use the reservation system; their availability is validated at approval time and re-validated under lock at finalization.

### Rule 6 — Reservations are created at origin manager approval

For movements, `ACTIVE` reservations are created when the request transitions from `SUBMITTED` to `ORIGIN_MANAGER_APPROVED`. This is the moment the origin Manager commits to releasing those units.

Reservations are **not** created at submission time. Stock availability at submission is checked as a soft warning to the user, but no claim is placed until the origin Manager signs off.

**Why origin approval, not submission?**

Submission is a user-facing action with no managerial authority. Creating a reservation at submission would allow any user to lock up large quantities of stock simply by submitting requests, without requiring any oversight. Tying reservation creation to Manager approval ensures a human with location authority has validated the transfer before stock is committed.

### Rule 7 — Reservation creation is atomic with the status transition

The status update (`SUBMITTED → ORIGIN_MANAGER_APPROVED`) and the creation of all `ACTIVE` reservation records must occur within a single transaction. If reservation creation fails for any item, the entire transaction rolls back and the status remains `SUBMITTED`.

This prevents a state where the request shows `ORIGIN_MANAGER_APPROVED` but stock is not actually reserved.

### Rule 8 — `reservedQty` cache must be updated alongside reservation status changes

Every reservation lifecycle event must update `StockBalance.reservedQty` in the same transaction:

| Event | Cache update |
|-------|-------------|
| Reservation created (`ACTIVE`) | `reservedQty += qty` |
| Reservation released (`RELEASED`) | `reservedQty -= qty` |
| Reservation consumed (`CONSUMED`) | `reservedQty -= qty` |

The cache is an optimization for read performance. If it falls out of sync, availability calculations silently understate or overstate what is free. The live aggregate from `StockReservation WHERE status = ACTIVE` is always authoritative.

### Rule 9 — Reservations must be released on cancellation or rejection

If a movement request is cancelled or rejected while reservations are `ACTIVE`, all `ACTIVE` reservations for that request must be transitioned to `RELEASED` within the same transaction as the status change. Leaving orphaned `ACTIVE` reservations permanently reduces available stock for that product-location.

| Scenario | Reservations exist? | Must release? |
|----------|--------------------|-|
| Cancelled from `SUBMITTED` | No | No |
| Cancelled from `ORIGIN_MANAGER_APPROVED` | Yes | **Yes** |
| Cancelled from `DESTINATION_OPERATOR_APPROVED` | Yes | **Yes** |
| Rejected from `SUBMITTED` | No | No |
| Rejected from `ORIGIN_MANAGER_APPROVED` | Yes | **Yes** |

### Rule 10 — Consuming a reservation requires verifying it exists first

Before finalization can proceed, the system must confirm that `ACTIVE` reservations exist for the request. If none are found, finalization throws a `ValidationError`. This guards against the edge case where a request somehow reaches the `DESTINATION_OPERATOR_APPROVED` status without reservations having been created — a state that should be impossible, but must be caught if it ever occurs.

---

## 5. Ledger Rules

### Rule 11 — The ledger is append-only

`StockLedger` rows are **never updated or deleted** after creation. There is no `update()` or `delete()` method on the ledger repository — only `create()`. Any code that attempts to modify an existing ledger entry is incorrect and must not be merged.

**Why immutability matters:** The ledger is the only reconstruction path for historical stock state. If entries can be modified, point-in-time balance reconstruction becomes unreliable and audits cannot be trusted. Immutability is the foundation of stock auditability.

### Rule 12 — Ledger entries are created within the same transaction as the balance mutation

A ledger entry documents a specific mutation. If the mutation is rolled back, the ledger entry must be rolled back with it. If the ledger entry cannot be written, the mutation must not persist. These two writes are indivisible.

### Rule 13 — `balanceAfter` must reflect the actual post-mutation `onHandQty`

The `balanceAfter` field is a snapshot, not an estimate. It must be captured from the balance row after the mutation is applied, within the same transaction. Using a pre-computed value or skipping the read introduces drift between the ledger history and the actual balance sequence.

### Rule 14 — Ledger entries are never created for approval, cancellation, or rejection

Only events that change `onHandQty` produce ledger entries. Approvals, cancellations, and rejections do not touch stock and therefore do not generate ledger entries. Reservation creation and release are similarly not recorded in the ledger (they affect `reservedQty`, not `onHandQty`).

---

## 6. Transaction Requirements

### Rule 15 — All stock mutations are fully transactional

Every operation that touches `onHandQty`, `reservedQty`, `StockReservation.status`, or `StockLedger` must do so within a `prisma.$transaction` block. Partial writes — where some mutations succeed and others fail — leave the system in an inconsistent state that may be impossible to detect automatically.

### Rule 16 — Status transitions and their side effects are co-transactional

A workflow status change and its associated stock side effects must be committed together:

| Transition | Must be atomic with |
|-----------|---------------------|
| `SUBMITTED → ORIGIN_MANAGER_APPROVED` | Reservation creation |
| `APPROVED → FINALIZED` (adjustment) | All `onHandQty` mutations + ledger entries |
| `DESTINATION_OPERATOR_APPROVED → FINALIZED` (movement) | Reservation consumption + all `onHandQty` mutations + ledger entries |
| Any → `CANCELLED` or `REJECTED` (if reserved) | Reservation release |

If status and side effects land in separate transactions, a crash between them produces an inconsistent state: a request may show `FINALIZED` with no ledger entries, or `ACTIVE` reservations may exist for a `CANCELLED` request.

### Rule 17 — Status transitions use optimistic concurrency

Status updates use `updateMany` with a `WHERE status = <expected>` precondition rather than a plain `update`:

```typescript
const result = await tx.stockAdjustmentRequest.updateMany({
  where: { id: requestId, status: AdjustmentRequestStatus.APPROVED },
  data:  { status: AdjustmentRequestStatus.FINALIZED, ... },
});
if (result.count === 0) throw new ValidationError('...');
```

If `count === 0`, a concurrent process already moved the status and the current operation aborts. This prevents two concurrent callers from both finalizing the same request and applying double mutations. The entire transaction is then rolled back.

### Rule 18 — Row-level locks must be acquired before reads used in validation

The sequence `lock → read → validate → mutate` is the only safe ordering. Reading `onHandQty` without a lock, then validating, then locking and mutating creates a TOCTOU window where another transaction can consume the stock between the read and the mutation, bypassing the availability check.

The correct implementation (`lockBalanceRow()` → validate → mutate) always holds the lock across all three steps within the same transaction.

---

## 7. Common Failure Scenarios

These are the most likely ways stock consistency can be broken, and why the rules above prevent them.

---

### Scenario 1 — Double finalization

**What happens:** Two concurrent API requests both attempt to finalize the same adjustment at the same time.

**Without protection:** Both read status as `APPROVED`, both apply stock mutations, `onHandQty` is decremented twice for the same items.

**How it is prevented:** Rule 17. The `updateMany` with `WHERE status = APPROVED` means only one transaction can claim the `FINALIZED` status. The second gets `count = 0` and throws before any stock mutation runs. Both are inside transactions, so neither leaves a partial write.

---

### Scenario 2 — Over-allocation via concurrent requests

**What happens:** Two movement requests are submitted for the same product-location. Each sees `availableQty = 50` at read time. Both create reservations for 40 units. Combined reservations now exceed available stock.

**Without protection:** Stock becomes over-committed. When both finalize, source `onHandQty` is decremented to -30.

**How it is prevented:** Rules 7 and 18. Reservation creation acquires a `SELECT FOR UPDATE` lock on the `StockBalance` row. The second reservation creation blocks until the first transaction commits. When it reads the locked row, `reservedQty` has already been incremented by the first, so `availableQty = 50 - 40 = 10`. Attempting to reserve 40 fails the availability check and throws.

---

### Scenario 3 — Orphaned reservations after cancellation

**What happens:** A movement is cancelled, but the reservation release step fails silently. `ACTIVE` reservations remain. `availableQty` is permanently reduced for that product-location even though the movement no longer exists.

**Without protection:** Stock is effectively frozen. Future requests for those units fail availability checks even though the stock is physically present.

**How it is prevented:** Rule 9 and Rule 16. Cancellation and reservation release are co-transactional. If the release fails, the status update rolls back — the request stays in its current status and can be retried. There is no path to a `CANCELLED` status that leaves `ACTIVE` reservations behind.

---

### Scenario 4 — Ledger and balance divergence

**What happens:** A stock mutation succeeds but the ledger write fails. `onHandQty` is updated, but no record of the change exists.

**Without protection:** Historical reconstruction yields the wrong balance. Audits show a discrepancy that cannot be explained from the ledger alone.

**How it is prevented:** Rule 12. The balance mutation and ledger entry are in the same transaction. If the ledger write fails, the entire transaction rolls back, including the balance update. Both succeed together or neither does.

---

### Scenario 5 — Finalizing a movement with no reservations

**What happens:** Due to a bug, a movement somehow reaches `DESTINATION_OPERATOR_APPROVED` without having gone through origin approval (or reservations were silently skipped). Finalization is attempted.

**Without protection:** Stock is decremented at source with no prior reservation, potentially driving `onHandQty` negative and bypassing availability checks.

**How it is prevented:** Rule 10. `consumeTransferReservationWithinTx` checks for `ACTIVE` reservations before proceeding and throws `ValidationError` if none are found. Finalization cannot complete without them.

---

### Scenario 6 — Reading stale available stock without lock

**What happens:** A request reads `onHandQty = 100, reservedQty = 0` and computes `availableQty = 100`. Before it can reserve, another transaction reserves 80 units and commits. The original transaction now reserves 70 units, believing 100 were available.

**Without protection:** `reservedQty` becomes 150 > `onHandQty`. The cache is wrong, and the next availability check using it will produce a negative available quantity.

**How it is prevented:** Rule 18. The lock is acquired before reading the balance. The second reservation blocks until the first transaction commits (which updates `reservedQty`). When unblocked, the second transaction reads the already-updated row and validates against the true current state.

---

### Scenario 7 — Cache drift between `reservedQty` and `StockReservation` sum

**What happens:** A reservation is created in `StockReservation` but the corresponding `reservedQty` increment in `StockBalance` is omitted (or vice versa).

**Without protection:** Availability calculations using the cached `reservedQty` are wrong. If the cache is understated, over-allocation becomes possible. If overstated, available stock is artificially suppressed.

**How it is prevented:** Rule 8. Every reservation creation, release, and consumption explicitly updates the cache in the same transaction. The `getAvailableStock()` function queries the live aggregate from `StockReservation` for authoritative checks, while the cache serves as a fast-path. If the cache is ever suspected to be wrong, the live aggregate is the correct value.

---

## 8. Why These Rules Exist

### Stock is irreversible once finalized

There is no `UNFINALIZE` transition. Once `onHandQty` changes and a ledger entry is written, the only corrective action is a new opposing request (e.g., a new adjustment reversing the change). This makes correctness at write time non-negotiable — errors cannot be silently patched after the fact.

### The ledger is the audit record

Regulators, warehouse managers, and support staff rely on the ledger to answer "what happened to this stock?" questions. If the ledger can be modified, that question becomes unanswerable. Immutability is what makes the ledger a reliable audit trail rather than an approximate log.

### Reservations prevent phantom availability

Without reservations, a product showing `onHandQty = 50` across multiple concurrent in-progress movements could be allocated 50 units to each. By the time each movement finalizes, `onHandQty` would go deeply negative. Reservations make the actual available quantity visible before finalization, enabling early rejection of infeasible requests rather than late-stage stock corruption.

### Transactions prevent partial state

A system that processes stock changes as a sequence of individual writes is vulnerable to crashes, timeouts, and concurrent access at every step. Wrapping each logical operation in a transaction guarantees that the system is always in a valid state — either the full operation committed, or it did not happen at all. There is no in-between.

### Locks prevent race conditions

Optimistic validation ("check then act") without locks is insufficient under concurrent load. Two transactions can both pass the availability check before either writes, resulting in both proceeding with a stale view of the world. Row-level locks serialize concurrent operations on the same balance row, ensuring that validation and mutation are always performed against the current committed state.

### Strict status gating prevents out-of-order effects

The availability check at adjustment approval time (`SUBMITTED → APPROVED`) is a soft, non-locking check. It gives the approving Manager a real-time view of stock, but does not commit any claim. The hard, locked check happens at finalization. This two-phase design balances UX (early feedback) against correctness (committed check at the moment of actual stock change).
