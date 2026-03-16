# workflow-test-scenarios.md

## Purpose

This document defines **critical workflow test scenarios** that must always pass. These scenarios ensure that stock integrity, approval flows, and reservation logic are never broken when new code is introduced.

AI development tools must generate **integration tests** based on these scenarios.

The goal is to guarantee:

- stock never becomes negative
- reservations behave correctly
- approvals follow the correct order
- ledger history remains immutable

These tests should be implemented using **Jest integration tests**.

---

# Test Environment

Tests must run using:

- a dedicated test database
- deterministic seed data

The system should load the **demo seed** or a dedicated **test seed** before executing tests.

---

# Scenario 1 — Create Stock Adjustment Request

Goal:

Verify operator can create adjustment request.

Steps:

1. Login as operator of Location A
2. Create adjustment request
3. Add product PROD-001 qty +10

Expected:

- request status = PENDING
- reservation applied if adjustment decreases stock
- request visible in adjustment list

---

# Scenario 2 — Prevent Duplicate Product Rows

Goal:

Ensure the same product cannot appear twice in one request.

Steps:

1. Create adjustment request
2. Add PROD-001 twice

Expected:

Request rejected with validation error.

---

# Scenario 3 — Manager Approval for Adjustment

Goal:

Verify manager approval works.

Steps:

1. Operator creates adjustment
2. Manager approves

Expected:

- status becomes APPROVED
- request moves to finalization stage

---

# Scenario 4 — Adjustment Finalization

Goal:

Ensure stock changes only occur during finalization.

Steps:

1. Adjustment approved
2. Operator finalizes

Expected:

- stock balance updated
- ledger entry created
- request status FINALIZED

---

# Scenario 5 — Movement Request Creation

Goal:

Verify movement request workflow begins correctly.

Steps:

1. Operator at Location A
2. Create movement request to Location B
3. Add product PROD-001 qty 10

Expected:

- reservation created at source
- status = PENDING_ORIGIN_APPROVAL

---

# Scenario 6 — Prevent Negative Stock

Goal:

Ensure system blocks movements exceeding available stock.

Steps:

1. Stock = 10
2. Create movement request for 15

Expected:

Request rejected.

---

# Scenario 7 — Origin Manager Approval

Goal:

Verify first approval stage.

Steps:

1. Operator creates movement
2. Manager of origin approves

Expected:

Status becomes:

PENDING_DESTINATION_APPROVAL

---

# Scenario 8 — Destination Operator Approval

Goal:

Verify second approval stage.

Steps:

1. Origin manager approves
2. Destination operator approves

Expected:

Status becomes:

READY_FOR_FINALIZATION

---

# Scenario 9 — Movement Finalization

Goal:

Ensure stock transfer occurs correctly.

Steps:

1. Request ready for finalization
2. Destination operator finalizes

Expected:

- origin stock decreases
- destination stock increases
- reservation released
- ledger entries created

---

# Scenario 10 — Reservation Blocking

Goal:

Ensure reserved stock cannot be reused.

Steps:

1. Stock = 100
2. Request A reserves 80
3. Request B tries to reserve 30

Expected:

Second request rejected.

---

# Scenario 11 — Cancel Movement Request

Goal:

Ensure cancellation releases reservation.

Steps:

1. Movement request created
2. Cancel request

Expected:

- reservation released
- request status CANCELLED

---

# Scenario 12 — Cancel Adjustment Request

Goal:

Ensure adjustment cancellation works.

Steps:

1. Adjustment created
2. Cancel request

Expected:

- request status CANCELLED
- reservations released

---

# Scenario 13 — Ledger Immutability

Goal:

Ensure ledger entries cannot be modified.

Steps:

1. Create finalized adjustment
2. Attempt to update ledger record

Expected:

Operation rejected.

---

# Scenario 14 — Historical Stock Calculation

Goal:

Verify stock history reporting.

Steps:

1. Execute several stock changes
2. Query earlier time period

Expected:

- correct starting quantity
- correct inbound/outbound totals
- correct ending quantity

---

# Scenario 15 — Multi-Item Request

Goal:

Ensure multiple rows work correctly.

Steps:

1. Create movement request
2. Add 3 products

Expected:

- reservations created for all items
- approval workflow applies to entire request

---

# Scenario 16 — Role Authorization

Goal:

Ensure only authorized users perform actions.

Steps:

1. Operator attempts manager approval

Expected:

Request rejected.

---

# Scenario 17 — Cross Location Access

Goal:

Ensure users only access permitted locations.

Steps:

1. Operator from Location A attempts action in Location B

Expected:

Access denied.

---

# Scenario 18 — Audit Log Creation

Goal:

Verify audit entries are generated.

Steps:

1. Perform stock adjustment

Expected:

Audit log entry created containing:

- user id
- location
- request id
- action

---

# Scenario 19 — Concurrent Reservation Protection

Goal:

Prevent race conditions.

Steps:

1. Two requests attempt reservation simultaneously

Expected:

Only one succeeds.

---

# Scenario 20 — Request Visibility

Goal:

Ensure request lists filter by location.

Steps:

1. Operator with single location
2. Open movement list

Expected:

Only requests from their location shown.

---

# AI Test Generation Requirements

AI tools must generate **integration tests** for all scenarios.

Tests must:

- seed deterministic data
- run workflows via service layer
- validate stock balances
- validate ledger records

---

# Success Criteria

All scenarios must pass before code is merged.

Failing tests indicate potential corruption of:

- stock integrity
- workflow rules
- authorization rules

Developers must not bypass these tests.

