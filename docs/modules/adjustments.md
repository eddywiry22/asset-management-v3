# Stock Adjustments Module

## 1. Purpose

Stock Adjustments provide the controlled mechanism for manually correcting inventory quantities — for example, after a physical count, to record damage, or to correct data entry errors. An adjustment is a **request document** that must pass through an approval workflow before it has any effect on stock.

The request and the stock change are strictly separated: creating or approving an adjustment does **not** touch inventory. Stock changes only when an approved adjustment is **finalized**.

---

## 2. Workflow (Status Transitions)

```
[DRAFT] ──submit──► [SUBMITTED] ──approve──► [APPROVED] ──finalize──► [FINALIZED]
                         │                       │
                       reject                  cancel
                         ↓                       ↓
                    [REJECTED]             [CANCELLED]

DRAFT or SUBMITTED ──cancel──► [CANCELLED]
```

FINALIZED, REJECTED, and CANCELLED are terminal states. No further transitions are possible from them.

### Status Meanings

| Status | Description |
|--------|-------------|
| `DRAFT` | Editable by the creator. No approval or stock impact yet. |
| `SUBMITTED` | Locked for editing. Awaiting manager review. |
| `APPROVED` | Approved by a manager. Ready to finalize. Still no stock impact. |
| `FINALIZED` | Stock has been adjusted. Permanent, cannot be undone. |
| `REJECTED` | Rejected by a manager during review. Terminal. |
| `CANCELLED` | Cancelled before finalization. Terminal. |

### Who Performs Each Transition

| Transition | Who Can Act | Notes |
|------------|-------------|-------|
| Create → `DRAFT` | Any authenticated user | Location must be active. |
| `DRAFT` → `SUBMITTED` | Request creator only | Must have at least one item. |
| `SUBMITTED` → `APPROVED` | MANAGER or ADMIN | Non-admin must have a role at one of the item's locations. |
| `SUBMITTED` → `REJECTED` | MANAGER or ADMIN | Rejection reason is required. |
| `APPROVED` → `FINALIZED` | Any user with location access | OPERATOR or MANAGER role at an item location. |
| Any pre-terminal → `CANCELLED` | Creator, MANAGER at item location, or ADMIN | Cancellation reason is required. |

### Editing Restrictions

Only `DRAFT` requests can be modified. Once submitted, the request is locked.

| Action | Allowed in DRAFT | Who |
|--------|-----------------|-----|
| Add / edit / delete items | Yes | Creator only |
| Update notes | Yes | Creator only |
| Delete the request | Yes | Creator only |
| Any modification | No (all other statuses) | — |

---

## 3. Approval Logic

Approval is a **prerequisite** for finalization — it cannot be skipped.

### Who Can Approve

- **ADMIN**: can approve any request.
- **MANAGER**: can approve if they have a role at any location referenced by the request's items.
- **OPERATOR**: cannot approve.

### What Is Checked at Approval Time

1. Request status is `SUBMITTED`.
2. Approver has the required role and location access.
3. All item locations are active. If any location is inactive, approval is blocked.
4. For items with negative `qtyChange`: `availableQty + qtyChange >= 0`. Approval is blocked if stock is insufficient at the time of approval.

A non-blocking warning is recorded if any product-location registration has become inactive since the request was submitted, but approval is not blocked by this alone.

### Rejection

A MANAGER or ADMIN may reject a `SUBMITTED` request. A non-empty reason is required. Rejection is terminal — the request cannot be resubmitted. The creator must open a new request if the adjustment is still needed.

---

## 4. Finalization Behavior

Finalization is the **only action that changes stock**. It executes as a single atomic database transaction.

### Pre-Conditions (All Must Pass)

The following are hard blocks that prevent finalization:

| Condition | Error |
|-----------|-------|
| Status is not `APPROVED` | Cannot finalize a request with status `{status}` |
| Any item location is inactive | Location(s) must be reactivated first |
| Any product-location registration is inactive | Item(s) must be reactivated or removed |
| No eligible users (OPERATOR/MANAGER) at item locations | At least one eligible user must exist at each location |
| Insufficient available stock for a negative adjustment | Finalization rolls back entirely |

### Atomic Transaction

All of the following happen in one database transaction, or none of them do:

1. Request status is claimed: `APPROVED → FINALIZED` using a conditional update (`WHERE status = APPROVED`). If this fails (e.g., concurrent finalization attempt), the transaction aborts immediately.
2. For each line item, `applyAdjustmentTx` runs:
   - Acquires a row-level lock (`SELECT FOR UPDATE`) on the `StockBalance` row.
   - For negative `qtyChange`: validates `availableQty >= |qtyChange|`.
   - Updates `StockBalance.onHandQty` (increment or decrement).
   - Writes one append-only `StockLedger` entry with `sourceType = ADJUSTMENT`.

If any item fails its stock check, the entire transaction rolls back. The request remains `APPROVED` and can be retried after the issue is resolved.

---

## 5. Stock Impact

### What Changes on Finalization

| Table | Change |
|-------|--------|
| `StockAdjustmentRequest` | Status → `FINALIZED`; `finalizedById` and `finalizedAt` set |
| `StockBalance` | `onHandQty` incremented or decremented per item |
| `StockLedger` | One new entry per item (`sourceType: ADJUSTMENT`, `sourceId: requestId`) |
| `StockAdjustmentItem` | Unchanged — preserved as the audit record of what was requested |

### What Does Not Change on Earlier Steps

| Step | StockBalance | StockLedger |
|------|-------------|-------------|
| Create | No change | No change |
| Submit | No change | No change |
| Approve | No change | No change |
| Reject | No change | No change |
| Cancel | No change | No change |

### Stock Ledger Entry

Each finalized item produces one immutable ledger row:

| Field | Value |
|-------|-------|
| `productId` | From the adjustment item |
| `locationId` | From the adjustment item |
| `changeQty` | The `qtyChange` value (positive or negative) |
| `balanceAfter` | The `onHandQty` immediately after this change |
| `sourceType` | `ADJUSTMENT` |
| `sourceId` | The adjustment request ID |
| `createdAt` | Written once; never updated |

The ledger is append-only and immutable. There is no mechanism to delete or modify ledger entries.

### Available vs On-Hand

The stock check at finalization operates on **available quantity**, not raw on-hand:

```
availableQty = onHandQty − reservedQty
```

A negative adjustment must satisfy `availableQty >= |qtyChange|`. Stock that is already reserved by pending transfers cannot be consumed by an adjustment.

---

## 6. Key Rules

- **Stock changes only on finalization.** Approval is a gate, not a stock operation. No inventory is touched until `finalize()` succeeds.
- **Approval cannot be skipped.** A `DRAFT` or `SUBMITTED` request cannot be finalized directly.
- **Finalization is all-or-nothing.** If any item in the request fails its stock check, no items are applied. The entire transaction rolls back.
- **DRAFT is the only editable state.** Once submitted, neither the creator nor a manager can modify line items or notes. To correct a mistake in a submitted request, it must be rejected or cancelled and a new request opened.
- **Only the creator can submit or delete a draft.** Managers cannot submit on behalf of someone else.
- **Rejection is terminal.** A rejected request cannot be reopened. A new request must be created.
- **Cancellation requires a reason.** Both cancellation and rejection must include a non-empty textual reason for audit purposes.
- **Inactive locations block all key actions.** Submit, approve, and finalize are all blocked if any item's location is inactive. The location must be reactivated before the workflow can proceed.
- **Inactive product registrations block finalization.** If a product is deactivated at a location after approval, finalization is blocked until the registration is restored or the item is removed. (Items cannot be removed after submission — the request must be cancelled and recreated.)
- **Request numbers are immutable identifiers.** Format: `ADJ-YYYYMMDD-LOCCODE-XXXX`. Generated at creation and never changed.
