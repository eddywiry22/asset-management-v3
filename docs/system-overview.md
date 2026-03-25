# Asset Management System — System Overview

## 1. System Purpose

This is a multi-location inventory management system designed for warehouse operations. It provides centralized control over stock levels across multiple physical locations, with structured approval workflows for all stock changes.

The system enforces strict stock integrity: no stock mutation happens outside of a finalized, approved request. All changes are traceable through an immutable ledger.

---

## 2. Core Concepts

### Product

A product represents a globally defined item (identified by SKU) with master data such as name, category, vendor, and unit of measure. Products exist at the global level — they are not inherently active or inactive on their own.

### ProductLocation

ProductLocation is the join between a product and a warehouse location. It is the primary control point for whether a product is available at a given location.

- **Created automatically** when a product is created (one entry per existing location) or when a location is created (one entry per existing product).
- **Default state is inactive.** A product must be explicitly activated at a location before it can be used in stock operations there.
- Activation is managed through the **Product Registration** module.

This design means product availability is always location-scoped — the same product can be active at one warehouse and inactive at another.

### Stock

Stock state is tracked per product per location through two structures:

| Model | Purpose |
|---|---|
| `StockBalance` | Live snapshot of current inventory (`onHandQty`, `reservedQty`) |
| `StockLedger` | Immutable, append-only log of every stock change |

**Available stock** is always derived as:

```
availableQty = onHandQty - reservedQty
```

`reservedQty` reflects inventory committed to in-progress transfers and cannot be used by other requests.

### Requests

All stock changes flow through typed request objects with defined status workflows:

- **Stock Adjustment Request** — changes stock at a single location (increases or decreases)
- **Stock Transfer Request** — moves stock from one location to another

Both request types require approval before stock is affected.

---

## 3. Key Business Rules

1. **Stock only changes on finalization.** Submitting or approving a request never touches inventory. The `StockBalance` and `StockLedger` are only updated when a request reaches `FINALIZED` status, inside a database transaction.

2. **The stock ledger is immutable.** Ledger entries are never updated or deleted. Every finalization appends new entries. This ensures a complete and tamper-proof audit trail.

3. **Reservations prevent overselling.** When a transfer is approved at origin, a hard reservation is created. The reserved quantity is locked in `reservedQty` and cannot be allocated to any other request until the transfer is finalized or cancelled.

4. **Products must be registered and active at a location** before they can appear in any stock request for that location. A product that becomes inactive after a request is created will trigger a warning during processing.

5. **Locations must be active** to be used in new requests.

6. **Access is location-scoped.** Non-admin users only see and act on requests that involve locations they are assigned to. Admins have full visibility.

7. **All stock mutations run inside database transactions** with row-level locking on `StockBalance` to prevent race conditions.

---

## 4. Main Workflows

### Product Lifecycle

```
1. Admin creates a Product (global)
   → ProductLocation rows auto-created for all existing locations (inactive by default)

2. Admin activates the product at specific location(s) via Product Registration
   → ProductLocation.isActive = true

3. Product is now usable in stock requests at those locations
```

When a new Location is created, the same auto-creation occurs in reverse: a `ProductLocation` row is created for every existing product, defaulting to inactive.

---

### Stock Adjustment Workflow

Used to correct stock at a single location (physical count corrections, write-offs, etc.).

```
DRAFT
  → Creator adds line items (product + location + quantity change)
  → Creator submits

SUBMITTED
  → Eligible manager reviews
  → Approve: validates stock is sufficient for any negative adjustments
  → Reject: requires a reason (terminal)

APPROVED
  → Creator (or manager) finalizes
  → Transaction: applies qtyChange to StockBalance, writes StockLedger entries
  → Status transitions to FINALIZED (terminal)

CANCELLED (from DRAFT or APPROVED)
```

**No stock is touched until FINALIZED.**

---

### Stock Movement (Transfer) Workflow

Used to move stock between two warehouse locations.

```
DRAFT
  → Creator specifies origin location, destination location, and line items

SUBMITTED
  → Origin manager reviews
  → Approve-origin: validates available stock at origin, creates hard RESERVATION
  → reservedQty incremented at origin

ORIGIN_MANAGER_APPROVED
  → Destination operator acknowledges and confirms readiness

DESTINATION_OPERATOR_APPROVED / READY_TO_FINALIZE
  → Finalize: transaction executes:
      - Decrements onHandQty and releases reservedQty at origin (TRANSFER_OUT ledger entry)
      - Increments onHandQty at destination (TRANSFER_IN ledger entry)
  → Reservation status set to CONSUMED
  → Status: FINALIZED (terminal)

CANCELLED or REJECTED (at any pre-final stage)
  → If a reservation exists, it is RELEASED and reservedQty decremented
```

---

## 5. Data Flow

```
User Action
    │
    ▼
HTTP Request → Controller (input validation via Zod)
    │
    ▼
Service Layer (business rules, status guards, access checks)
    │
    ├──► Repository (read current state, e.g. StockBalance, ProductLocation)
    │
    └──► [On Finalize] Database Transaction
              ├── Lock StockBalance row (SELECT FOR UPDATE)
              ├── Validate available stock
              ├── Update StockBalance (onHandQty / reservedQty)
              ├── Append StockLedger entry (immutable)
              ├── Update request status
              └── Update StockReservation (transfers only)
```

**Live data enrichment:** Non-terminal requests returned by the API are enriched with current `StockBalance` values at response time. This means the UI always shows live stock context, not stale snapshots from when the request was created.

---

## 6. Design Decisions

### Why ProductLocation instead of a product-level flag?

A single product can be sold or stocked at some locations but not others. A product-level active flag cannot express this. ProductLocation makes availability a first-class, location-scoped concern and allows independent control per warehouse.

### Why are ProductLocation rows auto-created?

Requiring manual setup for every product-location pair would create operational gaps — products could be stocked at a location with no tracking record. Auto-creation on product or location creation ensures the matrix is always complete. Defaulting to inactive means nothing is implicitly available; activation is always an explicit decision.

### Why does stock only change on finalization?

Multi-step approvals mean a request may sit in an intermediate state for hours or days. Applying stock changes early would cause inconsistencies if the request is later rejected or cancelled. Deferring all mutations to finalization keeps the stock state clean and predictable at all times.

### Why is the ledger immutable?

The ledger is the source of truth for what actually happened to inventory. Making it append-only prevents retroactive correction of records and ensures that audits, reconciliations, and period reports always reflect real history.

### Why use hard reservations for transfers (but not adjustments)?

Transfers involve two locations and a delay between approval and execution. Without a reservation, available stock at the origin could be consumed by a concurrent adjustment or another transfer before the first transfer finalizes — a silent oversell. Hard reservations lock that quantity explicitly. Adjustments operate at a single location and are validated at both approval and finalization, making soft validation sufficient.

### Why is access location-scoped?

Warehouse operators and managers have operational responsibility only for their assigned locations. Scoping visibility and actions to assigned locations prevents accidental cross-location interference and enforces a clear chain of custody for inventory decisions.
