# Testing Strategy: Inventory Management System

## 1. Overview

This document defines the testing strategy for the asset management system — a production inventory platform built around stock correctness, multi-step approval workflows, and role-based access. Testing must go beyond validating API responses and instead verify that the system behaves correctly across the full lifecycle of a request: from creation through approval, reservation, and finalization.

The core risk areas are:
- **Stock integrity** — wrong quantities reaching production cause real operational damage
- **Reservation race conditions** — double-booking or premature release corrupts balances
- **Workflow gate violations** — wrong roles approving at wrong stages
- **Ledger immutability** — any mutation of the ledger breaks the audit trail

---

## 2. What Must Be Tested

### 2.1 Stock Correctness

Stock balances are derived from an immutable ledger. The central invariant is:

```
availableQty = onHandQty - reservedQty
```

Any test that touches stock must verify both the balance row AND the corresponding ledger entry.

#### Critical Scenarios

**Adjustment finalization:**
- After finalizing an adjustment with `changeQty = +50`, `onHandQty` increases by exactly 50
- After finalizing with `changeQty = -20`, verify `onHandQty` decreases by 20 and a ledger entry of type `ADJUSTMENT` with `changeQty = -20` is created
- `balanceAfter` in the ledger entry must equal the new `onHandQty`

**Transfer finalization:**
- Source location `onHandQty` decreases by exactly the transferred quantity
- Destination location `onHandQty` increases by exactly the transferred quantity
- Ledger shows `TRANSFER_OUT` at source and `TRANSFER_IN` at destination
- `reservedQty` at source returns to 0 after finalization

**Deduction guard:**
- Attempting to finalize an adjustment that would push `onHandQty` below 0 must fail with an error
- Attempting to finalize a transfer when available stock (onHand - reserved) < transfer quantity must fail

**Period-based stock metrics:**
- For a given date range, `finalQty = startingQty + inboundQty - outboundQty`
- Ledger entries outside the date range must not affect the period result
- Inbound sources counted: `SEED`, `ADJUSTMENT` (positive), `MOVEMENT_IN`, `TRANSFER_IN`
- Outbound sources counted: `ADJUSTMENT` (negative), `MOVEMENT_OUT`, `TRANSFER_OUT`

---

### 2.2 Workflows

Workflows must be tested as full end-to-end state machines, not as isolated endpoint calls.

#### Adjustment Workflow: `DRAFT → SUBMITTED → APPROVED → FINALIZED`

| Transition | Who can trigger | What to verify |
|---|---|---|
| Submit | Request creator | Status becomes `SUBMITTED`; items locked |
| Approve | Manager at affected location | Status becomes `APPROVED` |
| Reject | Manager at affected location | Status becomes `REJECTED`; reason stored |
| Finalize | Operator or Manager at location | Status becomes `FINALIZED`; stock updated; ledger written |
| Cancel | Creator (from SUBMITTED or APPROVED) | Status becomes `CANCELLED`; no stock change |

**Scenarios to test:**
1. Full happy path: create → add items → submit → approve → finalize → verify stock
2. Rejection path: submit → reject with reason → verify reason persisted, stock unchanged
3. Cancellation after approval: approve → cancel → verify stock unchanged
4. Double finalization: attempt to finalize an already-FINALIZED request → must fail
5. Finalize with insufficient stock: set stock lower than required qty → must fail at finalization
6. Delete a DRAFT: must succeed and leave no orphaned items
7. Attempt to delete a SUBMITTED request: must fail

#### Transfer Workflow: `DRAFT → SUBMITTED → ORIGIN_MANAGER_APPROVED → DESTINATION_OPERATOR_APPROVED → FINALIZED`

| Transition | Who can trigger | What to verify |
|---|---|---|
| Submit | Creator | Status becomes `SUBMITTED` |
| Origin approve | Manager at source location | Status becomes `ORIGIN_MANAGER_APPROVED`; reservations created |
| Destination approve | Operator or Manager at destination | Status becomes `READY_TO_FINALIZE` |
| Finalize | Operator or Manager at destination | Status becomes `FINALIZED`; stock moved; reservations consumed |
| Reject (any stage) | Eligible approver | Status becomes `REJECTED`; reservations released |
| Cancel | Creator or eligible user | Reservations released; stock unchanged |

**Scenarios to test:**
1. Full happy path: create → submit → origin approve → destination approve → finalize → verify both balances
2. Origin approval with insufficient stock: must fail before reservations are created
3. Reservation isolation: after origin approval, a second transfer for the same product/location cannot exceed available (unreserved) stock
4. Cancellation after origin approval: reservations must be released; `reservedQty` must decrease
5. Rejection after destination approval: reservations released; `reservedQty` returns to pre-approval value
6. Same-location transfer: source and destination identical → must fail validation

---

### 2.3 Permissions

Permission tests must verify that actions are rejected for the wrong role, not just that they succeed for the right role.

#### Role Matrix

| Action | Admin | Manager (location) | Operator (location) | Other user |
|---|---|---|---|---|
| Approve adjustment | Yes | Yes (own location) | No | No |
| Finalize adjustment | Yes | Yes (own location) | Yes (own location) | No |
| Approve transfer (origin) | Yes | Yes (source location) | No | No |
| Approve transfer (destination) | Yes | Yes (dest location) | Yes (dest location) | No |
| Finalize transfer | Yes | Yes (dest location) | Yes (dest location) | No |
| Create master data (products, locations) | Yes | No | No | No |
| View all locations | Yes | Own only | Own only | No |

#### Scenarios to test

1. **Role boundary for adjustments:**
   - Operator at Location A attempts to approve a SUBMITTED adjustment → must return 403
   - Manager at Location B attempts to approve an adjustment for Location A → must return 403
   - Manager at the correct location approves → succeeds

2. **Role boundary for transfers:**
   - Operator at source location attempts to approve transfer at origin step → must return 403
   - Manager at destination attempts to approve at origin step → must return 403
   - Correct manager at source approves origin step → succeeds
   - Correct operator at destination approves destination step → succeeds

3. **Location visibility:**
   - User with roles only at Location A queries the stock list → results contain only Location A data
   - Admin queries the stock list → sees all locations including inactive ones
   - User with no location roles queries stock → empty result, not an error

4. **Admin-only routes:**
   - Non-admin user calls `POST /v1/admin/products` → must return 403
   - Admin calls the same endpoint → succeeds

5. **Deactivated user:**
   - Deactivate a user who is the next approver on a pending transfer
   - Verify that user no longer appears in `getTransferEligibleUsers()` output
   - Verify their JWT is rejected on subsequent requests (or that their actions are blocked)

---

## 3. Manual Testing Approach

Manual testing should follow workflow scripts, not random API calls. Each session should start from a clean seed state.

### Adjustment Test Script

```
1. Log in as OPERATOR at Location A
2. Create a new adjustment request (POST /stock-adjustments)
3. Add two items: one positive qty change, one negative qty change
4. Submit the request (POST /stock-adjustments/:id/submit)
5. Log in as MANAGER at Location A
6. Approve the request (POST /stock-adjustments/:id/approve)
7. Log back in as OPERATOR
8. Finalize the request (POST /stock-adjustments/:id/finalize)
9. Query stock balance for both affected products at Location A
   → Verify onHandQty changed by the exact quantities
10. Query ledger for both products at Location A
    → Verify two new ADJUSTMENT entries with correct changeQty and balanceAfter
```

### Transfer Test Script

```
1. Record current onHandQty and reservedQty for Product X at Location A and B
2. Log in as OPERATOR at Location A (or admin)
3. Create transfer: source=A, destination=B, items=[{productId: X, qty: 10}]
4. Submit the transfer
5. Log in as MANAGER at Location A
6. Approve at origin (POST /stock-transfers/:id/origin-approve)
   → Verify StockReservation record created with qty=10, status=ACTIVE
   → Verify reservedQty at Location A increased by 10
7. Log in as OPERATOR at Location B
8. Approve at destination (POST /stock-transfers/:id/destination-approve)
9. Finalize the transfer (POST /stock-transfers/:id/finalize)
   → Verify onHandQty at Location A decreased by 10
   → Verify onHandQty at Location B increased by 10
   → Verify reservedQty at Location A returned to original value
   → Verify StockReservation status=CONSUMED
   → Verify TRANSFER_OUT ledger entry at Location A
   → Verify TRANSFER_IN ledger entry at Location B
```

### Permission Boundary Test Script

```
1. Log in as OPERATOR at Location A
2. Create an adjustment at Location A and submit it
3. Log in as OPERATOR at Location A (same role, different session)
4. Attempt to approve the submitted adjustment
   → Expect 403 Forbidden
5. Log in as MANAGER at Location B (different location)
6. Attempt to approve the same adjustment
   → Expect 403 Forbidden
7. Log in as MANAGER at Location A
8. Approve the adjustment
   → Expect 200 OK
```

---

## 4. Seed Data Strategy

A consistent seed state is required before each test session. The seed must cover all role combinations needed to walk through workflows.

### Required Seed Records

**Users:**

| Username | Role | Location | Purpose |
|---|---|---|---|
| `admin@test.com` | isAdmin=true | — | Full system access |
| `mgr-alpha@test.com` | MANAGER | Alpha Warehouse | Approves adjustments, origin-approves transfers |
| `mgr-beta@test.com` | MANAGER | Beta Warehouse | Origin-approves transfers from Beta |
| `op-alpha@test.com` | OPERATOR | Alpha Warehouse | Creates requests, finalizes |
| `op-beta@test.com` | OPERATOR | Beta Warehouse | Destination-approves transfers to Beta |
| `readonly@test.com` | (no role) | — | Verifies 403 rejections |

**Locations:**

| Code | Name | Status |
|---|---|---|
| `ALPHA` | Alpha Warehouse | Active |
| `BETA` | Beta Warehouse | Active |
| `INACTIVE` | Inactive Store | Inactive (for deactivation tests) |

**Products:**

| SKU | Name | Notes |
|---|---|---|
| `PROD-001` | Test Product A | Active, registered at ALPHA and BETA |
| `PROD-002` | Test Product B | Active, registered at ALPHA only |
| `PROD-003` | Inactive Product | isActive=false (for blocked-action tests) |

**Initial Stock Balances (at seed time):**

| Product | Location | onHandQty | reservedQty |
|---|---|---|---|
| PROD-001 | ALPHA | 100 | 0 |
| PROD-001 | BETA | 50 | 0 |
| PROD-002 | ALPHA | 200 | 0 |

**Ledger Entries:**
Each initial balance must have a corresponding `SEED` ledger entry so the period-based metrics work correctly from day 0.

### Resetting to Seed State

Before each manual test session:
1. Run the seed script to reset balances and clear all pending requests
2. Verify dashboard shows zero pending actions for all test users
3. Confirm ledger contains only SEED entries

---

## 5. Regression Testing Areas

These are areas where bugs are most likely to reappear after changes. Prioritize re-testing these whenever related code changes.

### 5.1 Reservation Lifecycle

Any change to `reservation.service.ts` or `transfer.service.ts` requires re-running:
- Origin approval creates reservation and increments `reservedQty`
- Cancellation releases reservation and decrements `reservedQty`
- Rejection after destination approval releases reservation correctly
- Finalization consumes (not releases) reservation — `reservedQty` decrements, `onHandQty` moves

**Common regression:** Reservation released instead of consumed on finalization, or vice versa — both result in stale `reservedQty` values.

### 5.2 Available Stock Calculation

Test any path where `availableQty = onHandQty - reservedQty` is used as a guard:
- Adjustment deduction blocked when available < requested qty
- Origin transfer approval blocked when available < transfer qty
- Both checks must use the live reservation total, not a cached value

**Common regression:** Checking `onHandQty` instead of `availableQty`, allowing overbooking.

### 5.3 Workflow State Guards

After any workflow change:
- Verify that each status transition is only allowed from the correct predecessor state
- Verify that a request cannot be submitted twice, finalized twice, or cancelled after finalization

**Common regression:** Missing state check on one endpoint, allowing an out-of-order transition.

### 5.4 Location Visibility Isolation

After any change to `getVisibleLocationIds()` or the RBAC middleware:
- User at Location A cannot see stock, requests, or ledger entries for Location B
- Admin can see everything, including inactive locations

**Common regression:** Visibility filter bypassed when no location filters are passed in the query, leaking all records.

### 5.5 Ledger Immutability

After any change to stock write paths:
- Verify that no code path updates or deletes existing ledger entries
- Verify `balanceAfter` in each ledger entry matches the `onHandQty` at the time of the write

**Common regression:** Ledger entry written outside the transaction that updates the balance, causing `balanceAfter` to be stale.

### 5.6 Product-Location Registration Gate

After changes to product registration or stock write logic:
- Adjustments or transfers that include unregistered product-location pairs must be rejected
- Deactivated product-location registrations must block new requests but not break historical records

---

## 6. Suggested Future Automation

The following areas offer the highest value for automated test coverage based on system complexity and regression risk.

### High Priority

**Reservation concurrency tests:**
Two concurrent requests attempting to reserve the last 10 units of a product at the same location. Only one should succeed. Requires real database transactions and cannot be tested with mocked Prisma. Use integration test setup with a real (or containerized) database.

**Full workflow integration tests:**
Replace the current mock-based tests with full database-backed tests for:
- Adjustment: DRAFT → FINALIZED with stock verification at each step
- Transfer: DRAFT → FINALIZED with reservation state verification at each step

**Permission matrix tests:**
Parameterized tests covering every role/action combination in the permission matrix (Section 2.3). Each test should assert both the allowed case (200) and the forbidden case (403).

### Medium Priority

**Period-based stock metric accuracy:**
Seed a known ledger history spanning multiple date ranges. Assert that querying different date windows returns mathematically consistent results.

**Saved filter isolation:**
Verify that a saved filter created by User A is not visible to User B, even if both query the same module.

**Dashboard action counts:**
After seeding a known set of pending requests, verify the dashboard counts match exactly for each user role.

### Lower Priority

**Request number format:**
Assert generated numbers match `ADJ-YYYYMMDD-LOCCODE-XXXX` and `TRF-YYYYMMDD-SRCCODE-DSTCODE-XXXX` patterns and are unique across concurrent requests.

**Inactive entity propagation:**
Deactivate a location mid-workflow and verify pending requests are not broken (completed via their existing references) but new requests to that location are blocked.
