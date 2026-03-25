# Stock Movements (Transfers) Module

## 1. Purpose

The Movements module transfers stock from one location to another through a structured multi-step approval process. Unlike adjustments, a transfer involves two distinct parties — an **origin** (the location giving stock) and a **destination** (the location receiving it) — each with their own approval step before stock physically moves.

Stock at the origin is **reserved** when the origin manager approves, protecting it from being consumed by other operations. The reservation is only consumed — and the stock actually moved — at finalization. Nothing changes at the destination until that point.

---

## 2. Workflow (Status Transitions)

```
[DRAFT] ──submit──► [SUBMITTED] ──approve origin──► [ORIGIN_MANAGER_APPROVED]
                         │                                    │
                       reject                          approve destination
                         │                                    │
                         ▼                                    ▼
                    [REJECTED]                      [READY_TO_FINALIZE]
                                                            │
                   ORIGIN_MANAGER_APPROVED ──reject──► [REJECTED]
                                                            │
                                                        finalize
                                                            │
                                                            ▼
                                                       [FINALIZED]

SUBMITTED, ORIGIN_MANAGER_APPROVED,
READY_TO_FINALIZE ──cancel──► [CANCELLED]
```

FINALIZED, CANCELLED, and REJECTED are terminal states.

### Status Meanings

| Status | Description |
|--------|-------------|
| `DRAFT` | Editable by creator. No stock impact. |
| `SUBMITTED` | Submitted for origin review. Locked for editing. Stock not yet reserved. |
| `ORIGIN_MANAGER_APPROVED` | Origin manager approved. **Stock reserved at source.** Awaiting destination acknowledgement. |
| `READY_TO_FINALIZE` | Destination has acknowledged. Both approvals complete. Ready for finalization. |
| `FINALIZED` | Stock moved. Terminal. |
| `CANCELLED` | Cancelled before finalization. Reservations released if any existed. Terminal. |
| `REJECTED` | Rejected at origin review or after origin approval. Reservations released if any existed. Terminal. |

### Who Performs Each Transition

| Transition | From | To | Required Role |
|------------|------|----|---------------|
| Create | — | `DRAFT` | Any authenticated user; access to source location required |
| Submit | `DRAFT` | `SUBMITTED` | Creator only |
| Approve origin | `SUBMITTED` | `ORIGIN_MANAGER_APPROVED` | **MANAGER at source location** |
| Reject (at origin) | `SUBMITTED` | `REJECTED` | MANAGER at source location |
| Approve destination | `ORIGIN_MANAGER_APPROVED` | `READY_TO_FINALIZE` | OPERATOR or MANAGER at destination location |
| Reject (at destination) | `ORIGIN_MANAGER_APPROVED` | `REJECTED` | Any user with destination location access |
| Finalize | `READY_TO_FINALIZE` | `FINALIZED` | OPERATOR or MANAGER at destination location |
| Cancel | `SUBMITTED`, `ORIGIN_MANAGER_APPROVED`, or `READY_TO_FINALIZE` | `CANCELLED` | Creator, any location participant, or ADMIN |

DRAFT requests cannot be cancelled — delete the request instead.

### Editing Restrictions

Only `DRAFT` requests can be modified. The creator is the only one who can add, edit, or delete items, or delete the request itself. Once submitted, the request is fully locked.

---

## 3. Reservation Logic

Reservations ensure that stock committed to a transfer cannot be simultaneously allocated elsewhere. They are created at a precise point in the workflow and released or consumed depending on how the transfer ends.

### When Reservations Are Created

Reservations are created **at origin approval** (`SUBMITTED → ORIGIN_MANAGER_APPROVED`), not at submission.

The origin approval and the reservation are a single atomic transaction:

1. Transfer status is claimed: `SUBMITTED → ORIGIN_MANAGER_APPROVED`.
2. For each item, a row-level lock (`SELECT FOR UPDATE`) is acquired on the `StockBalance` row.
3. Available quantity is computed: `availableQty = onHandQty − SUM(active reservations)`.
4. If `availableQty < qty`, the entire transaction rolls back — status stays `SUBMITTED`.
5. A `StockReservation` record is created with `status = ACTIVE`.
6. `StockBalance.reservedQty` is incremented (cache, kept in sync with the reservation table).

All items must reserve successfully. If any item fails, no reservations are created for any item.

> **Note:** At submission time, the system performs a non-binding stock availability check (warns if stock is insufficient) but does **not** create reservations. The reservation is the origin manager's commitment, not the submitter's.

### Reservation Lifecycle

```
[ACTIVE] ─── transfer finalized ───► [CONSUMED]
[ACTIVE] ─── transfer rejected  ───► [RELEASED]
[ACTIVE] ─── transfer cancelled ───► [RELEASED]
```

| Event | Reservation Status | reservedQty |
|-------|-------------------|-------------|
| Origin approved | ACTIVE | +qty (incremented) |
| Destination approved | ACTIVE (no change) | no change |
| Finalized | CONSUMED | −qty (decremented) |
| Rejected or cancelled | RELEASED | −qty (decremented) |

When a transfer is rejected or cancelled from `ORIGIN_MANAGER_APPROVED` or `READY_TO_FINALIZE`, all `ACTIVE` reservations for that transfer are released atomically alongside the status update. If cancelled from `SUBMITTED` (before origin approval), no reservations exist and no release step is needed.

---

## 4. Approval Steps

### Step 1 — Origin Approval

**Who:** MANAGER at the source location (or ADMIN).

**What it does:**
- Verifies the source location is active.
- Validates that available stock covers all requested quantities.
- Reserves stock for every item (atomic with status update).
- Sets `originApprovedById` and `originApprovedAt`.

After this step, the stock is locked. `availableQty` at the source decreases immediately. Other operations (transfers, adjustments) see reduced available quantity.

**Can be rejected here:** Yes. A MANAGER at the source can reject the transfer at `SUBMITTED`. No reservations exist yet, so no release is needed.

### Step 2 — Destination Approval

**Who:** OPERATOR or MANAGER at the destination location (or ADMIN).

**What it does:**
- Confirms that the destination is ready to receive the goods.
- Sets `destinationApprovedById` and `destinationApprovedAt`.
- Advances status to `READY_TO_FINALIZE`.

**No stock changes occur at this step.** This is an acknowledgement only.

**Can be rejected here:** Yes. Any user with destination location access can reject from `ORIGIN_MANAGER_APPROVED`. The rejection releases all active reservations atomically.

**Cannot be rejected after this step.** Once `READY_TO_FINALIZE` is reached, the only forward path is finalization or cancellation.

---

## 5. Finalization Logic

Finalization is the **only action that moves stock**. It executes as a single atomic database transaction encompassing both locations.

### Pre-Conditions (All Must Pass Before the Transaction)

| Condition | Notes |
|-----------|-------|
| Status is `READY_TO_FINALIZE` | Hard block |
| Source location is active | Hard block |
| Destination location is active | Hard block |
| All products are registered and active at destination | Hard block — products not registered at destination cannot be received |
| At least one eligible user (OPERATOR or MANAGER) exists at destination | Hard block |
| Source ≠ destination | Validated at creation; re-checked at finalize |

Stock quantity is not re-validated here — it was validated and locked at origin approval. Active reservations serve as the guarantee.

### Atomic Transaction

All of the following happen in one database transaction, or none of them do:

**1. Status claim**
```
UPDATE StockTransferRequest
  SET status = FINALIZED, finalizedAt = now
  WHERE id = :id AND status = READY_TO_FINALIZE
```
If this conditional update matches zero rows (e.g., a concurrent finalization attempt), the transaction aborts immediately before touching any stock.

**2. For each item — consume reservation and move stock**

At the **source location**:
- Locate the `ACTIVE` `StockReservation` for this item. Abort if none found.
- Verify the reservation's location matches the declared source (integrity check).
- Mark reservation `ACTIVE → CONSUMED`.
- Decrement `StockBalance.onHandQty` by `qty`.
- Decrement `StockBalance.reservedQty` by `qty`.
- Write a `TRANSFER_OUT` ledger entry (`changeQty = −qty`).

At the **destination location**:
- Upsert a `StockBalance` row if one does not yet exist.
- Increment `StockBalance.onHandQty` by `qty`.
- Write a `TRANSFER_IN` ledger entry (`changeQty = +qty`).

Both locations are updated within the same transaction. There is no intermediate state where stock has left the source but not arrived at the destination.

**3. Snapshot recording (pre-transaction)**

Before entering the transaction, the system reads current balances and writes them to the `TransferItem` row for the historical record:

| Field | Value |
|-------|-------|
| `beforeQtyOrigin` | `onHandQty` at source immediately before finalization |
| `afterQtyOrigin` | `beforeQtyOrigin − qty` |
| `beforeQtyDestination` | `onHandQty` at destination immediately before finalization |
| `afterQtyDestination` | `beforeQtyDestination + qty` |

These fields are `NULL` until finalization and are never updated afterward.

---

## 6. Stock Impact — Origin vs Destination

### At the Source Location

| Field | Change | Reason |
|-------|--------|--------|
| `onHandQty` | −qty | Stock physically leaves |
| `reservedQty` | −qty | Reservation consumed |
| `availableQty` | no net change from finalization¹ | Was already reduced at reservation |

> ¹ `availableQty` dropped when the reservation was created. Finalization converts that locked quantity into an actual deduction — the visible available quantity does not change at finalization, only the underlying onHand/reserved split.

### At the Destination Location

| Field | Change | Reason |
|-------|--------|--------|
| `onHandQty` | +qty | Stock arrives |
| `reservedQty` | no change | No pre-destination reservation exists |
| `availableQty` | +qty | Immediately available on arrival |

### Ledger Entries Written

Two immutable ledger entries are written per item:

| Entry | Location | `changeQty` | `sourceType` | `sourceId` |
|-------|----------|-------------|--------------|------------|
| Transfer out | Source | −qty | `TRANSFER_OUT` | Transfer request ID |
| Transfer in | Destination | +qty | `TRANSFER_IN` | Transfer request ID |

Both entries reference the same `sourceId`, making it possible to reconstruct the full cross-location movement from either side of the ledger.

### Stock Impact by Workflow Step

| Step | Source `onHandQty` | Source `reservedQty` | Destination `onHandQty` |
|------|--------------------|----------------------|-------------------------|
| Create | no change | no change | no change |
| Submit | no change | no change | no change |
| Approve origin | no change | +qty (reserved) | no change |
| Approve destination | no change | no change | no change |
| **Finalize** | **−qty** | **−qty** | **+qty** |
| Reject / Cancel | no change | −qty (released, if reserved) | no change |

---

## 7. Key Rules

- **Stock moves only at finalization.** Approval, reservation, and destination acknowledgement are all preparatory. The physical move is a single atomic transaction.
- **Reservation happens at origin approval, not submission.** Submitting a transfer does not lock any stock. Only when the origin manager approves does the reservation — and the reduction in available quantity — take effect.
- **Finalization is all-or-nothing across both locations.** If any item's reservation is missing or any stock check fails inside the transaction, the entire operation rolls back. Both locations revert. There is no partial transfer.
- **Reservations are the contract.** The system will not finalize a transfer without active reservations for every item. If reservations were somehow released (e.g., via cancellation) before a concurrent finalization attempt, finalization fails.
- **Destination receives stock immediately and freely.** No reservation is created at the destination. Stock arrives directly into `onHandQty` and is available at once.
- **The two approval steps are independent and location-scoped.** Origin approval requires a MANAGER at the source. Destination approval requires an OPERATOR or MANAGER at the destination. Neither party can perform the other's step.
- **Rejection at any pre-finalization stage releases reservations.** Whether rejected by the origin manager (before stock is reserved) or by a destination user (after stock is reserved), the system handles reservation cleanup atomically with the status update.
- **Source and destination must be different locations.** Enforced at creation and re-validated at finalization.
- **Inactive locations and unregistered products hard-block finalization.** A product must be registered and active at the destination before it can be received. An inactive source or destination blocks finalization; the location must be reactivated first.
- **Request numbers identify the route.** Format: `TRF-YYYYMMDD-SRCCODE-DSTCODE-XXXX`. The source and destination location codes are embedded, making request numbers self-describing.
