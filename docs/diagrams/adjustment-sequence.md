# Adjustment Sequence

This document describes the complete sequence of events for a stock adjustment from creation through to finalization. A stock adjustment changes the on-hand quantity at a location — either adding stock (positive quantity change) or removing it (negative quantity change).

---

## Table of Contents

1. [Overview](#1-overview)
2. [Roles Involved](#2-roles-involved)
3. [Step-by-Step Flow](#3-step-by-step-flow)
4. [System Behavior at Each Step](#4-system-behavior-at-each-step)
5. [Stock Impact](#5-stock-impact)
6. [Ledger Creation](#6-ledger-creation)

---

## 1. Overview

A stock adjustment modifies `onHandQty` for one or more products at a location. Each item in the request carries a signed `qtyChange`: positive to add stock, negative to remove it. Multiple items can be bundled in one request and are applied atomically — either all succeed or none do.

**Critical dependency: Finalization requires prior Manager approval.** An adjustment cannot be finalized directly after submission. It must pass through an explicit `APPROVED` state, gated by a Manager. This is the approval dependency that governs the entire flow.

### When Stock Changes

Stock changes **once and only once** — at finalization. No other step reads or modifies stock balances.

| Step | Transition | Stock effect |
|------|-----------|:------------:|
| 1 — Draft | — | None |
| 2 — Submit | DRAFT → SUBMITTED | None |
| 3 — Approve | **SUBMITTED → APPROVED** | None — approval is authorization only |
| 4 — Finalize | **APPROVED → FINALIZED** | **`onHandQty` changes here** |

> There are no reservations in the adjustment workflow. Unlike transfers, adjustments do not place a hold on stock at approval time. The stock availability check happens under a row-level lock at finalization only.

### State Machine

```
DRAFT
  │  (creator submits)
  ▼
SUBMITTED ──────────────────────────── REJECTED  ◄── Manager at item location
  │  (Manager approves)                              (terminal)
  ▼
APPROVED
  │  (OPERATOR or MANAGER finalizes)
  ▼
FINALIZED  ◄── terminal; stock changes here

CANCELLED ◄── reachable from DRAFT, SUBMITTED, APPROVED
               (creator / Manager at item location / Admin)
```

---

## 2. Roles Involved

| Role | Location requirement | Step(s) they perform |
|------|---------------------|----------------------|
| **Creator** | OPERATOR or MANAGER at item location(s) | Draft, Submit, (Cancel if creator) |
| **Approver** | **MANAGER** at item location(s) | Approve or Reject (Step 3) |
| **Finalizer** | OPERATOR or MANAGER at item location(s) | Finalize (Step 4) |
| **Admin** | None — global access | Any step, any location |

**Approval dependency explained:**

The Approver must hold the `MANAGER` role at the location of the items being adjusted. An OPERATOR cannot approve, even if they created the request. This is a hard permission check, not a soft suggestion.

The Creator and Finalizer can be the same person. The Approver cannot be the Finalizer in the same transaction, but the same user can hold all three roles across the sequence if they are a Manager at the item location.

---

## 3. Step-by-Step Flow

### Step 1 — Creator drafts the request

**Actor:** Creator (OPERATOR or MANAGER at item location)
**Transition:** None → `DRAFT`

The Creator specifies:
- One or more items: product, location, and `qtyChange` (positive or negative)
- A reason or note for the adjustment

The request is saved as `DRAFT`. No stock is read. No validation beyond field completeness occurs.

---

### Step 2 — Creator submits the request

**Actor:** Creator only
**Transition:** `DRAFT → SUBMITTED`

The Creator submits the request for Manager review.

**Checks at submission:**
- The actor is the creator of the request.
- The request has at least one item.
- The creator has access to the item location(s).

**No stock availability check occurs at submission.** The requested quantities are not validated against current balances. A request for −500 units can be submitted even if only 10 are on hand. The hard validation happens under lock at finalization.

The request enters the Manager's review queue in `SUBMITTED` status.

---

### Step 3 — Manager approves the request ★ APPROVAL GATE

**Actor:** Manager at item location(s) (or Admin)
**Transition:** `SUBMITTED → APPROVED`

**This is the approval gate.** An adjustment cannot reach finalization without passing through this step. An OPERATOR cannot bypass it. Even the creator cannot self-approve if they are only an OPERATOR.

**Checks at approval:**
1. Request is in `SUBMITTED` status.
2. Actor holds `MANAGER` role at at least one of the item locations. *(An Admin bypasses this check.)*
3. Each item location is active (hard block if any location is inactive).
4. Each product is actively registered at its location (hard block if not).

If all checks pass, the request status is updated to `APPROVED`.

**No stock change occurs at approval.** The Manager's action is authorization, not execution. Approving does not read stock balances, does not reserve units, and does not write any ledger entry.

The request now waits for an OPERATOR or Manager to finalize it.

---

### Step 4 — Finalizer executes the adjustment ★ STOCK CHANGES HERE

**Actor:** OPERATOR or MANAGER at item location(s) (or Admin)
**Transition:** `APPROVED → FINALIZED`

This is the only step that modifies `onHandQty`. The finalization applies all item quantity changes atomically inside a single database transaction.

**Pre-checks (before the transaction opens):**
1. Request is in `APPROVED` status.
2. Actor has access to the item location(s) (any role).
3. Each item location is active (hard block if any location is inactive).
4. At least one eligible active user (OPERATOR or MANAGER) exists at each item location — Stage 8.6 deadlock guard. *(If the only eligible user is about to be deactivated, they cannot finalize until another user is assigned.)*

**One atomic transaction executes:**

```
BEGIN TRANSACTION
  1. Claim FINALIZED status:
     updateMany WHERE id = requestId AND status = APPROVED → FINALIZED
     (optimistic concurrency: if count = 0, another caller won the race — roll back)

  2. For each item:
     a. Upsert StockBalance row for (productId, locationId) to 0 if missing
        (ensures lock target exists before acquiring lock)

     b. Acquire SELECT FOR UPDATE lock on StockBalance(productId, locationId)

     c. Read locked values: onHandQty, reservedQty

     d. Validate (only for negative qtyChange):
        available = onHandQty − reservedQty
        if (available + qtyChange) < 0:
          throw ValidationError  ──► ENTIRE TRANSACTION ROLLS BACK
          (no items are applied; status remains APPROVED)

     e. Apply mutation:
        if qtyChange >= 0: increment onHandQty by qtyChange
        if qtyChange  < 0: decrement onHandQty by |qtyChange|

     f. Create StockLedger entry {
          changeQty:    qtyChange,
          balanceAfter: new onHandQty,
          sourceType:   ADJUSTMENT,
          sourceId:     requestId
        }
COMMIT
```

**All-or-nothing:** If any item fails the availability check, the entire transaction rolls back. No partial application occurs — either every item in the request is applied, or none are.

After commit, the adjustment is complete and permanent. There is no undo operation; correcting an over-applied or wrong adjustment requires creating a new opposing adjustment request.

---

### Step 5 — Rejection (alternate path from Step 2)

**Actor:** Manager at item location(s) (or Admin)
**Transition:** `SUBMITTED → REJECTED`

The Manager rejects the request with a reason. Status changes to `REJECTED` (terminal).

No stock is affected. No ledger entries are written. The request is permanently closed.

---

### Step 6 — Cancellation (alternate path)

Available from `DRAFT`, `SUBMITTED`, or `APPROVED`.

**Who can cancel:**
- The creator (any role), from any non-terminal state.
- A Manager at any item location, from any non-terminal state — regardless of whether they are the creator.
- An Admin, from any non-terminal state.

No stock is affected regardless of which state the cancellation occurs from. Adjustments have no reservations to release. The request is permanently closed.

---

## 4. System Behavior at Each Step

| Step | Actor | Auth check | Pre-checks | Transaction | Stock touched? |
|------|-------|-----------|-----------|-------------|:--------------:|
| Draft | Creator | Access to item location | Field validation | Create request row | No |
| Submit | Creator only | Creator identity | Items exist | Update status: DRAFT → SUBMITTED | No |
| **Approve** | **MANAGER at item location** | **MANAGER role required** | **Locations active; products registered** | **Update status: SUBMITTED → APPROVED** | **No** |
| **Finalize** | **OPERATOR or MANAGER at item location** | **Any role at item location** | **Locations active; eligible users exist (Stage 8.6)** | **Claim FINALIZED + lock + validate + mutate onHandQty + write ledger (per item)** | **Yes — onHandQty** |
| Reject | MANAGER at item location | MANAGER role required | — | Update status: SUBMITTED → REJECTED | No |
| Cancel | Creator / MANAGER at location / Admin | Role-dependent | — | Update status → CANCELLED | No |

---

## 5. Stock Impact

### What changes and when

`onHandQty` changes exclusively at **finalization**. No other step in the adjustment workflow reads or writes stock balances.

**For a positive `qtyChange` (adding stock):**
```
StockBalance[productId, locationId]:
  onHandQty += qtyChange
  reservedQty  (unchanged)
```
No availability check is performed. Adding stock can never underflow.

**For a negative `qtyChange` (removing stock):**
```
Validation (under lock):
  available = onHandQty − reservedQty
  if (available + qtyChange) < 0 → abort

StockBalance[productId, locationId]:
  onHandQty += qtyChange  (i.e., decremented by |qtyChange|)
  reservedQty  (unchanged)
```

The validation uses `available` (not raw `onHandQty`) to account for units already committed to in-progress transfers. Removing stock that is reserved for a pending transfer is blocked.

### Availability formula used at finalization

```
available = onHandQty − reservedQty

Where:
  onHandQty   = current physical quantity (from locked StockBalance row)
  reservedQty = cached sum of ACTIVE transfer reservations at this location
```

**Example — pass:**
```
onHandQty   = 100
reservedQty =  30   (30 units committed to a pending transfer)
available   =  70

qtyChange   = −50
70 + (−50) = 20 ≥ 0  →  allowed
onHandQty after: 50
```

**Example — fail:**
```
onHandQty   = 100
reservedQty =  30
available   =  70

qtyChange   = −80
70 + (−80) = −10 < 0  →  ValidationError; entire adjustment rolled back
```

### No reservations in adjustments

Unlike transfers, adjustments place no hold on stock at approval time. The Manager approves the intent; the system validates feasibility at the moment of execution, under a row-level lock. This means:

- A Manager can approve an adjustment for −100 units when 90 are available.
- By the time someone finalizes, 100 units may be available (from an incoming transfer) — finalization succeeds.
- Or 60 units may now be available — finalization fails the check and rolls back.

The available quantity is always evaluated at the moment finalization runs, not at approval time.

---

## 6. Ledger Creation

### When ledger entries are written

Ledger entries are written **only at finalization**, inside the same transaction as the `onHandQty` mutation. No ledger entry is created at draft, submit, approve, reject, or cancel.

### One entry per item per finalization

Each item in the adjustment produces exactly one `StockLedger` record.

```
StockLedger {
  productId:    <item.productId>
  locationId:   <item.locationId>
  changeQty:    <item.qtyChange>           -- positive or negative
  balanceAfter: <onHandQty after mutation> -- snapshot taken post-commit
  sourceType:   ADJUSTMENT
  sourceId:     <adjustmentRequestId>      -- links back to the request
  createdAt:    <finalization timestamp>
}
```

**`balanceAfter` is captured from the mutated row within the same transaction**, not computed separately. It is the authoritative post-change balance for that moment in time.

### Ledger is immutable

Ledger entries are never updated or deleted after creation. They are the permanent audit trail for every stock change. If an adjustment is applied incorrectly, it cannot be undone by modifying the ledger — a new opposing adjustment must be created, which produces its own ledger entries.

### Tracing an adjustment through the ledger

Given an `adjustmentRequestId`, all ledger effects can be retrieved:

```sql
SELECT *
FROM StockLedger
WHERE sourceType = 'ADJUSTMENT'
  AND sourceId   = '<adjustmentRequestId>'
ORDER BY createdAt ASC;
```

This returns one row per item. `balanceAfter` on each row represents the `onHandQty` at that location immediately after the adjustment was applied.

### Total ledger entries per adjustment

| Adjustment items | Ledger entries written |
|:----------------:|:---------------------:|
| 1 | 1 |
| 3 | 3 |
| N | N |

All N entries are written in the same transaction and share the same `sourceId`. If the transaction fails (e.g., one item fails the availability check), **zero** entries are written.
