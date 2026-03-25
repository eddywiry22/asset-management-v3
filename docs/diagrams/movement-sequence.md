# Movement Sequence

This document describes the complete sequence of events for a stock transfer (movement) from request creation through to finalization. Every actor, system action, and database change is described in order.

> **Note on "reservation at submit":** Stock reservations are **not** created at submission. They are created when the origin Manager approves the request. Submission only validates that the request is structurally complete; it makes no claim on stock. See Step 3 for when stock is first affected.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Actors Involved](#2-actors-involved)
3. [Step-by-Step Flow](#3-step-by-step-flow)
4. [System Actions at Each Step](#4-system-actions-at-each-step)
5. [Database Effects](#5-database-effects)
6. [Failure Points](#6-failure-points)

---

## 1. Overview

A movement transfers a quantity of one or more products from a **source location** to a **destination location**. The transfer passes through five active states before completion. Stock is affected at two points only:

| Step | State transition | Stock effect |
|------|-----------------|-------------|
| 3 — Origin approval | `SUBMITTED → ORIGIN_MANAGER_APPROVED` | **Reservations created** — available qty reduced at source |
| 5 — Finalization | `READY_TO_FINALIZE → FINALIZED` | **Physical stock moved** — onHandQty decremented at source, incremented at destination |

All other steps change request metadata and status only. They have no effect on any stock balance or ledger.

### State Machine

```
DRAFT
  │  (creator submits)
  ▼
SUBMITTED
  │  (Manager at source approves)          ── REJECTED (Manager at source)
  ▼                                              │
ORIGIN_MANAGER_APPROVED                          │ reservations released
  │  (any role at destination approves)   ── REJECTED (any role at destination)
  ▼                                              │
READY_TO_FINALIZE                                │ reservations released
  │  (any role at destination finalizes)
  ▼
FINALIZED  ◄── terminal

CANCELLED ◄── reachable from SUBMITTED, ORIGIN_MANAGER_APPROVED, READY_TO_FINALIZE
               (creator, any participant, or Admin)
               reservations released if status was ORIGIN_MANAGER_APPROVED or READY_TO_FINALIZE
```

---

## 2. Actors Involved

| Actor | Role | Location | Responsibilities in this workflow |
|-------|------|----------|----------------------------------|
| **Creator** | OPERATOR or MANAGER | Source | Creates the request, submits it |
| **Origin Manager** | MANAGER | **Source** | Approves (or rejects) the transfer at origin — triggers reservation |
| **Destination Approver** | OPERATOR or MANAGER | **Destination** | Confirms the destination is ready to receive stock |
| **Finalizer** | OPERATOR or MANAGER | **Destination** | Executes the transfer — triggers stock mutation |
| **Admin** | — (global) | Any | Can act at any step for any location |

**Key constraints:**
- The Origin Manager must hold the `MANAGER` role specifically at the **source** location. An OPERATOR at the source cannot perform this step.
- The Destination Approver and Finalizer only need any role (OPERATOR or MANAGER) at the **destination** location. The same person can perform both steps.
- The Creator and Origin Manager are commonly different people, but the same user can hold both if they are a Manager at the source and also submitted the request.

---

## 3. Step-by-Step Flow

### Step 1 — Creator drafts the request

**Actor:** Creator (OPERATOR or MANAGER at source)
**Transition:** None → `DRAFT`

The Creator opens a new transfer request and specifies:
- Source location
- Destination location
- One or more items: product + quantity per item

The request is saved as `DRAFT`. No validations beyond field-level checks occur. No stock is read, reserved, or affected.

---

### Step 2 — Creator submits the request

**Actor:** Creator
**Transition:** `DRAFT → SUBMITTED`

The Creator submits the request. The system performs structural validation only:

- The request must have at least one item.
- Source and destination locations must be different.
- The Creator must have access to the source location.

**No stock check is performed at submission. No stock is reserved. The request enters a queue awaiting origin Manager review.**

---

### Step 3 — Origin Manager approves at source ★ FIRST STOCK EFFECT

**Actor:** Manager at source location (or Admin)
**Transition:** `SUBMITTED → ORIGIN_MANAGER_APPROVED`

This is the first step that affects stock. The Manager's approval is a commitment: the source location agrees to release these units.

**Pre-checks (all must pass before the transaction opens):**
1. Request is in `SUBMITTED` status.
2. Actor holds MANAGER role at the source location (or is Admin).
3. Source location is active (hard block if inactive).
4. Each product is actively registered at the source location (hard block if not).

**If all pre-checks pass, one atomic transaction executes:**

```
BEGIN TRANSACTION
  1. Update request status: SUBMITTED → ORIGIN_MANAGER_APPROVED
     (optimistic concurrency: updateMany WHERE status = SUBMITTED;
      if count = 0, another caller won the race — roll back entire tx)

  2. For each item:
     a. Upsert StockBalance row to 0 if missing (ensures lock target exists)
     b. Acquire SELECT FOR UPDATE lock on StockBalance(productId, sourceLocationId)
     c. Compute available = onHandQty − (sum of ACTIVE StockReservation.qty)
     d. Validate: available >= item.qty
        → if not: throw ValidationError — ENTIRE TRANSACTION ROLLS BACK
     e. Create StockReservation { status: ACTIVE, qty: item.qty, sourceId: requestId }
     f. Increment StockBalance.reservedQty by item.qty
COMMIT
```

After this step, the units are **reserved but not yet moved**. `onHandQty` at the source is unchanged. `reservedQty` at the source is increased, reducing available stock for new requests.

---

### Step 4 — Destination approves receipt

**Actor:** OPERATOR or MANAGER at destination (or Admin)
**Transition:** `ORIGIN_MANAGER_APPROVED → READY_TO_FINALIZE`

The destination location acknowledges it is ready to receive the stock.

**Pre-checks:**
1. Request is in `ORIGIN_MANAGER_APPROVED` status.
2. Actor has access to the destination location (any role).
3. Destination location is active (hard block if inactive).

**No stock changes occur at this step.** The reservations at source remain `ACTIVE`. No new database records are written for stock.

The request status is updated to `READY_TO_FINALIZE`.

---

### Step 5 — Finalizer completes the transfer ★ STOCK ACTUALLY MOVES

**Actor:** OPERATOR or MANAGER at destination (or Admin)
**Transition:** `READY_TO_FINALIZE → FINALIZED`

This is the only step where `onHandQty` changes. Physical stock is moved from source to destination.

**Pre-checks (all must pass before the transaction opens):**
1. Request is in `READY_TO_FINALIZE` status.
2. Actor has access to the destination location (any role).
3. Source location is active (hard block if inactive).
4. Destination location is active (hard block if inactive).
5. Each product is actively registered at the destination location (hard block if not).
6. At least one eligible active user (OPERATOR or MANAGER) exists at the destination location — Stage 8.6 deadlock guard.

**Before the transaction, the system captures before/after qty snapshots** for each item at both source and destination. These are written to the request's item records as a permanent historical snapshot.

**One atomic transaction executes:**

```
BEGIN TRANSACTION
  1. Claim FINALIZED status:
     updateMany WHERE status = READY_TO_FINALIZE → FINALIZED
     (optimistic concurrency: if count = 0, concurrent finalizer won — roll back)

  2. For each item (via consumeTransferReservationWithinTx):
     a. Find ACTIVE StockReservation for this requestId
        → if none found: throw ValidationError — ENTIRE TRANSACTION ROLLS BACK
     b. Validate reservation.locationId = sourceLocationId (consistency check)
     c. Validate source StockBalance.onHandQty >= reservation.qty (final on-hand check)
        → if not: throw ValidationError — ENTIRE TRANSACTION ROLLS BACK

     d. Update StockReservation.status: ACTIVE → CONSUMED

     e. At SOURCE:
        - Decrement StockBalance.onHandQty by item.qty
        - Decrement StockBalance.reservedQty by item.qty
        - Create StockLedger { changeQty: -item.qty, sourceType: TRANSFER_OUT,
                               sourceId: requestId, balanceAfter: new onHandQty }

     f. At DESTINATION:
        - Upsert StockBalance row to 0 if missing
        - Acquire SELECT FOR UPDATE lock on StockBalance(productId, destinationLocationId)
        - Increment StockBalance.onHandQty by item.qty
        - Create StockLedger { changeQty: +item.qty, sourceType: TRANSFER_IN,
                               sourceId: requestId, balanceAfter: new onHandQty }
COMMIT
```

After this step, the transfer is complete and irreversible at the application level.

---

### Step 6 — Rejection (alternate path from Step 2 or Step 3)

**From `SUBMITTED`:**
- Actor: Manager at source (or Admin)
- Reservations: None exist yet → no release needed
- Stock effect: None

**From `ORIGIN_MANAGER_APPROVED`:**
- Actor: Any role at destination (or Admin)
- Reservations: `ACTIVE` reservations exist → must be released
- Transaction: status → `REJECTED` + release all ACTIVE reservations (status → `RELEASED`) + decrement `StockBalance.reservedQty` per item
- `onHandQty` is never touched during rejection

---

### Step 7 — Cancellation (alternate path from Steps 2, 3, or 4)

Cancellation is available from `SUBMITTED`, `ORIGIN_MANAGER_APPROVED`, and `READY_TO_FINALIZE`.

- **From `SUBMITTED`**: No reservations → no release. Status → `CANCELLED`.
- **From `ORIGIN_MANAGER_APPROVED` or `READY_TO_FINALIZE`**: Reservations exist → same release sequence as rejection. Status → `CANCELLED`.

---

## 4. System Actions at Each Step

| Step | Transition | Auth check | Pre-checks | Transaction contents | Stock effect |
|------|-----------|-----------|-----------|---------------------|:------------:|
| 1 — Draft | None → DRAFT | Access to source | Field validation | Create request row | None |
| 2 — Submit | DRAFT → SUBMITTED | Creator only | Items exist; locations differ | Update status | None |
| 3 — Approve origin | SUBMITTED → ORIGIN\_MANAGER\_APPROVED | MANAGER at source | Source active; products registered at source | Update status + create ACTIVE reservations + increment reservedQty | **reservedQty ↑** |
| 4 — Approve destination | ORIGIN\_MANAGER\_APPROVED → READY\_TO\_FINALIZE | Any role at dest | Destination active | Update status | None |
| 5 — Finalize | READY\_TO\_FINALIZE → FINALIZED | Any role at dest | Both locations active; products registered at dest; eligible users at dest; Stage 8.6 | Update status + CONSUME reservations + decrement source onHandQty + increment dest onHandQty + write ledger entries | **onHandQty moves** |
| 6 — Reject | SUBMITTED → REJECTED | MANAGER at source | — | Update status | None |
| 6 — Reject | ORIGIN\_MANAGER\_APPROVED → REJECTED | Any role at dest | — | Update status + RELEASE reservations + decrement reservedQty | **reservedQty ↓** |
| 7 — Cancel | SUBMITTED → CANCELLED | Creator or participant | — | Update status | None |
| 7 — Cancel | ORIGIN\_MANAGER\_APPROVED or READY\_TO\_FINALIZE → CANCELLED | Creator or participant | — | Update status + RELEASE reservations + decrement reservedQty | **reservedQty ↓** |

---

## 5. Database Effects

### 5.1 Reservation — Created at Step 3

One `StockReservation` record is created per line item when the origin Manager approves.

```
StockReservation {
  productId:    <item.productId>
  locationId:   <sourceLocationId>          -- always the source
  qty:          <item.qty>
  sourceType:   TRANSFER
  sourceId:     <transferRequestId>
  sourceItemId: <transferRequestItemId>
  status:       ACTIVE                      -- only ACTIVE reservations constrain stock
  createdAt:    <now>
}
```

Simultaneously, `StockBalance.reservedQty` at the source is incremented by `item.qty` for each item. This cache update is in the same transaction as the reservation record creation.

**Available stock at source after Step 3:**
```
availableQty = onHandQty - reservedQty
             = onHandQty - (previous_reservedQty + item.qty)
```

The units are committed to this transfer and cannot be allocated to other requests.

---

### 5.2 Stock Update — Applied at Step 5

`onHandQty` changes at Step 5 only. Two balance rows are modified per item.

**At source (decrement):**
```
StockBalance[productId, sourceLocationId]:
  onHandQty   -= item.qty    -- units leave source
  reservedQty -= item.qty    -- reservation is consumed, no longer counted
```

**At destination (increment):**
```
StockBalance[productId, destinationLocationId]:
  onHandQty   += item.qty    -- units arrive at destination
  reservedQty  (unchanged)   -- destination had no reservation for incoming stock
```

The reservation's `status` also moves to `CONSUMED` in the same transaction, permanently recording that these units were physically moved.

---

### 5.3 Ledger Entries — Written at Step 5

Two `StockLedger` records are created per item at finalization. The ledger is append-only — these records are never modified or deleted.

**TRANSFER_OUT (source):**
```
StockLedger {
  productId:    <item.productId>
  locationId:   <sourceLocationId>
  changeQty:    -<item.qty>              -- negative: units leaving
  balanceAfter: <new onHandQty at source after decrement>
  sourceType:   TRANSFER_OUT
  sourceId:     <transferRequestId>
  createdAt:    <finalization timestamp>
}
```

**TRANSFER_IN (destination):**
```
StockLedger {
  productId:    <item.productId>
  locationId:   <destinationLocationId>
  changeQty:    +<item.qty>             -- positive: units arriving
  balanceAfter: <new onHandQty at destination after increment>
  sourceType:   TRANSFER_IN
  sourceId:     <transferRequestId>
  createdAt:    <finalization timestamp>
}
```

Both entries share the same `sourceId` (the transfer request ID), making it possible to trace both sides of any movement from a single identifier.

**Summary of ledger entries per transfer with N items:**

| Step | Records written | sourceType | Count |
|------|----------------|-----------|-------|
| 3 — Approve origin | None | — | 0 |
| 5 — Finalize | One TRANSFER_OUT per item at source | `TRANSFER_OUT` | N |
| 5 — Finalize | One TRANSFER_IN per item at destination | `TRANSFER_IN` | N |
| **Total per transfer** | | | **2N** |

---

## 6. Failure Points

### 6.1 Insufficient available stock — Step 3

**When:** Origin Manager approves, but `availableQty < item.qty` for any item.

**What triggers it:** Another transfer or adjustment has already reserved or consumed units since the request was created.

**Effect:** The entire transaction rolls back. Status remains `SUBMITTED`. No reservations are created for any item in the batch (all-or-nothing). The Manager sees a `ValidationError` and must review the quantities.

**Recovery:** Reduce the requested quantity, wait for other reservations to be released, or cancel the request.

---

### 6.2 Source location inactive — Step 3

**When:** The source location is deactivated between submission and origin approval.

**Effect:** Hard block before the transaction opens. Status remains `SUBMITTED`. No reservations created.

**Recovery:** Admin must reactivate the source location.

---

### 6.3 Product not registered at source — Step 3

**When:** A product in the request is inactive or not registered at the source location at the time of approval.

**Effect:** Hard block. Status remains `SUBMITTED`. No reservations created.

**Recovery:** Admin must reactivate the product registration at the source location, or remove the item from the request.

---

### 6.4 Destination location inactive — Steps 4 or 5

**When:** The destination location is deactivated between origin approval and destination approval or finalization.

**Effect:** Hard block before the transaction opens. Status remains in its current state (`ORIGIN_MANAGER_APPROVED` or `READY_TO_FINALIZE`). Reservations remain `ACTIVE` at source.

**Recovery:** Admin must reactivate the destination location. Alternatively, reject or cancel the transfer to release the reservations.

---

### 6.5 Product not registered at destination — Step 5

**When:** A product is not actively registered at the destination location at finalization time.

**Effect:** Hard block before the transaction opens. Status remains `READY_TO_FINALIZE`. Reservations remain `ACTIVE`.

**Recovery:** Admin must create or reactivate the product registration at the destination location. Alternatively, reject or cancel the transfer.

---

### 6.6 No eligible users at destination — Step 5 (Stage 8.6)

**When:** All users at the destination location are inactive (or none exist), leaving no one eligible to finalize.

**Effect:** Hard block before the transaction opens. Status remains `READY_TO_FINALIZE`. Reservations remain `ACTIVE`.

**Recovery:** Admin must assign an active user (OPERATOR or MANAGER) to the destination location before finalization can proceed.

---

### 6.7 No active reservations at finalization — Step 5

**When:** The system enters the finalization transaction but finds no `ACTIVE` reservations for this request. This should not occur under normal operation but is explicitly guarded.

**Effect:** `ValidationError` thrown inside the transaction. Full rollback — status does not change from `READY_TO_FINALIZE`. Stock unchanged.

**Recovery:** Investigate why reservations are missing. This indicates a prior data integrity issue that must be resolved manually.

---

### 6.8 Concurrent double-finalization — Step 5

**When:** Two API calls attempt to finalize the same request at the same time.

**Effect:** Both enter the transaction. Only one can claim `READY_TO_FINALIZE → FINALIZED` via the optimistic `updateMany WHERE status = READY_TO_FINALIZE`. The second gets `count = 0`, throws `ValidationError`, and its entire transaction rolls back. Stock is decremented exactly once.

**Recovery:** Not needed — the second caller receives an error indicating the request is no longer in `READY_TO_FINALIZE` status.

---

### 6.9 Concurrent double origin-approval — Step 3

**When:** Two API calls attempt to approve origin at the same time.

**Effect:** Same optimistic concurrency mechanism — `updateMany WHERE status = SUBMITTED`. Only one succeeds. The second transaction rolls back; no duplicate reservations are created.

---

### Failure summary

| Failure | Step | Rolls back? | Reservations affected? | Stock affected? |
|---------|------|:-----------:|:----------------------:|:--------------:|
| Insufficient stock | 3 | Yes | None created | No |
| Source location inactive | 3 | Pre-tx block | None created | No |
| Product not at source | 3 | Pre-tx block | None created | No |
| Destination location inactive | 4 or 5 | Pre-tx block | Remain ACTIVE | No |
| Product not at destination | 5 | Pre-tx block | Remain ACTIVE | No |
| No eligible users at dest | 5 | Pre-tx block | Remain ACTIVE | No |
| No active reservations | 5 | Yes (inside tx) | None consumed | No |
| Double finalization | 5 | Yes (second tx) | First tx consumes normally | First tx only |
| Double origin approval | 3 | Yes (second tx) | First tx creates normally | No |
