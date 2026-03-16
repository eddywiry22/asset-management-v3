# AI System Architecture & Development Guidelines

This document provides strict implementation guidance for AI coding tools when building the Asset Management System. It must be followed together with `product-spec.md` and `prisma-schema.prisma`.

The purpose of this document is to prevent unsafe implementations that could break inventory integrity.

---

# 1. Core Architectural Principles

AI implementations MUST follow these rules:

1. **Stock integrity is the highest priority**.
2. **Stock may only change during FINALIZATION of requests**.
3. **All stock changes must generate immutable ledger entries**.
4. **Stock operations must always run inside a database transaction**.
5. **Reservations must prevent negative available stock**.
6. **Workflow states must be validated before any action**.

Any implementation violating these rules is incorrect.

---

# 2. Backend Module Architecture

Backend must follow a modular structure.

```
/src
  /modules
    auth
    users
    goods
    vendors
    categories
    locations
    stock
    adjustments
    movements
    audit

  /shared
    database
    errors
    middleware
    utils
```

Each module must contain:

```
controller
service
repository
validator
routes
```

Responsibilities:

- Controller → HTTP layer
- Service → business logic
- Repository → database access
- Validator → input validation

Stock mutations must ONLY occur inside services.

---

# 3. Transaction Safety Rules

All stock operations MUST run inside a database transaction.

Example pattern:

```
prisma.$transaction(async (tx) => {

  // validate workflow state

  // validate stock availability

  // update stock balance

  // insert ledger records

  // update request status

})
```

Never perform stock updates outside transactions.

---

# 4. Stock Balance Update Pattern

Stock balance updates must follow this exact sequence.

1. Lock the stock balance row.
2. Validate quantities.
3. Update quantities.
4. Insert ledger record.

Example safe pattern:

```
const stock = await tx.stockBalance.findUnique({
  where: { productId_locationId: { productId, locationId } }
})

if (!stock) throw Error("Stock record not found")

if (stock.onHandQty - stock.reservedQty < requestedQty)
  throw Error("Insufficient available stock")
```

---

# 5. Reservation Rules

Reservation occurs when request status becomes `SUBMITTED`.

Algorithm:

```
available = on_hand_qty - reserved_qty

if available < requested_qty
  reject request

reserved_qty += requested_qty
```

Reservation must be released when:

- request is cancelled
- request is finalized

---

# 6. Adjustment Workflow State Machine

Allowed transitions:

```
DRAFT
 → SUBMITTED
 → MANAGER_APPROVED
 → READY_TO_FINALIZE
 → FINALIZED
```

Cancellation allowed before FINALIZED.

State validation example:

```
if (adjustment.status !== "MANAGER_APPROVED")
  throw Error("Invalid workflow state")
```

---

# 7. Movement Workflow State Machine

Movement has two approval layers.

Allowed transitions:

```
DRAFT
 → SUBMITTED
 → ORIGIN_MANAGER_APPROVED
 → DESTINATION_OPERATOR_APPROVED
 → READY_TO_FINALIZE
 → FINALIZED
```

Rules:

- reservation occurs at SUBMITTED
- origin manager approves stock leaving origin
- destination operator confirms receipt
- finalize performs stock movement

---

# 8. Movement Finalization Algorithm

Movement finalization must perform both stock changes inside the same transaction.

Steps:

1. Load origin stock balance
2. Load destination stock balance
3. Validate origin reserved stock
4. Decrease origin on_hand
5. Decrease origin reserved
6. Increase destination on_hand
7. Create two ledger records

Pseudo logic:

```
origin.onHandQty -= qty
origin.reservedQty -= qty


destination.onHandQty += qty
```

Ledger entries:

```
MOVEMENT_OUT
MOVEMENT_IN
```

---

# 9. Ledger Integrity Rules

Ledger is immutable.

Rules:

- never update ledger rows
- never delete ledger rows
- corrections must be new entries

Ledger must always store:

- change_qty
- balance_after
- source_type
- source_id

---

# 10. Request Validation Rules

Before submitting requests:

1. Ensure no duplicate products in request items
2. Ensure product exists
3. Ensure product is active
4. Ensure location access is valid

---

# 11. Authorization Rules

Every request must validate user role.

Examples:

Operator permissions:

- create request
- submit request
- finalize adjustment

Manager permissions:

- approve adjustments
- approve movement origin

Destination operator:

- approve movement receipt

Admin permissions:

- manage master data
- view system data

Admin cannot approve requests.

---

# 12. Audit Logging Rules

Every critical action must generate audit logs.

Examples:

- request created
- request approved
- request finalized
- request cancelled

Audit record structure:

```
entity_type
entity_id
action
before_value
after_value
performed_by
timestamp
```

---

# 13. Error Handling

Standard error responses:

```
400 Validation Error
403 Unauthorized
404 Resource Not Found
409 Business Rule Violation
500 Internal Error
```

Example business errors:

- insufficient stock
- invalid workflow state
- unauthorized role

---

# 14. Concurrency Protection

Concurrent requests may attempt to reserve the same stock.

Protection strategy:

- database transactions
- row-level locking
- re-check available stock inside transaction

Never trust client-side validation.

---

# 15. Performance Guidelines

Important indexes must exist:

```
stock_balances(product_id, location_id)
stock_ledger(product_id, location_id, created_at)
adjustments(location_id, status)
movements(origin_location_id, status)
```

Stock dashboard queries must rely on indexed fields.

---

# 16. AI Implementation Order

AI should generate modules in the following order:

1. Database migrations
2. Authentication
3. Master data modules
4. Stock balance + ledger
5. Adjustment workflows
6. Movement workflows
7. Audit logging

Never implement stock workflows before stock ledger exists.

---

# 17. Safety Checklist for AI

Before completing any workflow implementation, verify:

- stock change happens only on finalize
- reservations prevent negative stock
- ledger records are written
- workflow states are validated
- operations run inside transactions

If any of these conditions are not satisfied, the implementation is invalid.

