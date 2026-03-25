# Database Design

## 1. Design Overview

The database is **MySQL 8**, accessed exclusively through **Prisma ORM**. All IDs are UUIDs generated at the application layer.

The schema is organized around three concerns:

- **Master data** — Products, Locations, Categories, Vendors, UOMs, Users
- **Stock state** — StockBalance (current) and StockLedger (history)
- **Request workflows** — StockAdjustmentRequest and StockTransferRequest, each with their line items

The central design invariant is that **stock state is always derived from finalized requests**. No row in `StockBalance` or `StockLedger` is written outside of a finalized, approved request.

---

## 2. Core Tables and Relationships

### Entity Map

```
Category ──┐
Vendor  ──►├── Product ──► ProductLocation ◄── Location ◄── UserLocationRole ◄── User
Uom     ──┘       │                                  │
                  │                                  │
                  ▼                                  ▼
            StockBalance ◄────────────────── (productId + locationId)
            StockLedger  ◄────────────────── (productId + locationId)
            StockReservation ◄─────────────── (productId + locationId)
                  ▲                                  ▲
                  │                                  │
       StockAdjustmentItem ──── StockAdjustmentRequest ──► User (multiple)
       StockTransferItem   ──── StockTransferRequest   ──► Location (source + dest)
                                                          ──► User (multiple)
```

### Master Data Tables

**`User`** — system accounts.

| Field | Notes |
|---|---|
| `username` | unique login identifier |
| `email`, `phone` | both optional, both unique when set |
| `isAdmin` | system-wide admin flag; no location scope |
| `isActive` | account enabled/disabled |

**`Location`** — physical warehouse locations.

| Field | Notes |
|---|---|
| `code` | short unique identifier (e.g. `WH-001`) used in request numbers |
| `isActive` | inactive locations cannot be used in new requests |

**`UserLocationRole`** — maps a user to a location with a role.

```
@@unique([userId, locationId])
```

One user can have at most one role per location. The `Role` enum has two values: `OPERATOR` and `MANAGER`. Admin users bypass this table entirely for access checks.

**`Product`** — global product definitions.

| Field | Notes |
|---|---|
| `sku` | unique identifier across all locations |
| `categoryId`, `vendorId`, `uomId` | required FK references |

Product has **no `isActive` field**. Availability is entirely controlled by `ProductLocation`.

**`Category`**, **`Vendor`**, **`Uom`** — reference data for products. `Category` and `Vendor` carry their own `isActive` flags for master data management. `Uom` has no active flag.

---

## 3. Product vs ProductLocation

This is the most important design distinction in the schema.

### Why They Are Separate

A product exists once globally (`Product`) but may be active at some locations and inactive at others. A product-level flag cannot express this. `ProductLocation` makes location-specific availability a first-class entity.

### The ProductLocation Table

```
ProductLocation
  id         UUID
  productId  → Product
  locationId → Location
  isActive   Boolean  (default true)
  @@unique([productId, locationId])
```

`isActive` on `ProductLocation` is **the only field in the entire schema that controls product availability**. `Product` itself has no such flag.

### The Complete Matrix

Every `(product, location)` pair has exactly one `ProductLocation` row. This matrix is maintained automatically:
- When a product is created → one row per existing location
- When a location is created → one row per existing product

This guarantees that the matrix is always complete. There is no such thing as a missing `ProductLocation` row for a valid product-location pair.

A product is considered available at a location if and only if `ProductLocation.isActive = true` for that pair.

---

## 4. Stock Model

Stock state is tracked through two complementary tables: `StockBalance` for current state and `StockLedger` for history.

### StockBalance — Current State

```
StockBalance
  productId   → Product
  locationId  → Location
  onHandQty   Decimal(15,4)
  reservedQty Decimal(15,4)
  @@unique([productId, locationId])
  @@index([locationId])
```

One row per `(product, location)` pair. Quantities use `Decimal(15,4)` throughout the schema to avoid floating-point errors.

**Derived quantity:**
```
availableQty = onHandQty - reservedQty
```

`availableQty` is never stored — it is always computed at query time. `reservedQty` tracks inventory committed to in-progress transfers and cannot be allocated to other requests.

`StockBalance` has no `createdAt` — it is an always-current snapshot, not a historical record.

### StockLedger — Immutable History

```
StockLedger
  productId    → Product
  locationId   → Location
  changeQty    Decimal(15,4)
  balanceAfter Decimal(15,4)
  sourceType   LedgerSourceType
  sourceId     String
  createdAt    DateTime
  (no updatedAt)
  @@index([productId, locationId, createdAt])
  @@index([locationId, createdAt])
```

**Critical invariant:** `StockLedger` rows are never updated or deleted. The absence of `updatedAt` is intentional — it enforces this at the schema level. Every stock change appends a new row.

`balanceAfter` is written at finalization time and records the `onHandQty` value immediately after the change is applied. This makes each ledger entry self-contained and auditable without replaying prior entries.

`sourceType` identifies what caused the change:

| Value | Source |
|---|---|
| `ADJUSTMENT` | Stock adjustment request |
| `TRANSFER_IN` | Transfer received at destination |
| `TRANSFER_OUT` | Transfer dispatched from origin |
| `MOVEMENT_IN` | Legacy movement in |
| `MOVEMENT_OUT` | Legacy movement out |
| `SEED` | Initial data seeding |

`sourceId` references the request ID that generated the entry, enabling full traceability.

### StockReservation — In-Flight Locks

```
StockReservation
  productId    → Product
  locationId   → Location
  qty          Decimal(15,4)
  sourceType   ReservationSourceType  (TRANSFER | ADJUSTMENT)
  sourceId     String
  sourceItemId String
  status       ReservationStatus      (ACTIVE | RELEASED | CONSUMED)
  @@index([productId, locationId])
  @@index([sourceType, sourceId])
```

A reservation locks a portion of `onHandQty` into `reservedQty`, preventing it from being allocated by concurrent requests. The lifecycle:

- **`ACTIVE`** — quantity is locked, counted in `reservedQty`
- **`RELEASED`** — request was cancelled or rejected; `reservedQty` is decremented
- **`CONSUMED`** — request was finalized; reservation is fulfilled and `reservedQty` is decremented as part of the same transaction that decrements `onHandQty`

`sourceItemId` ties the reservation to the specific line item that created it, enabling item-level release.

---

## 5. Request Models

### Stock Adjustments

An adjustment changes stock at a single location. It has a header and one or more line items.

**`StockAdjustmentRequest`**

The header tracks the full lifecycle of the request, including who performed each action and when:

| State field | Set on |
|---|---|
| `createdById` | Creation (always populated) |
| `approvedById` / `approvedAt` | Approval |
| `finalizedById` / `finalizedAt` | Finalization |
| `rejectedById` / `rejectedAt` / `rejectionReason` | Rejection |
| `cancelledById` / `cancelledAt` / `cancellationReason` | Cancellation |

Status workflow:

```
DRAFT → SUBMITTED → APPROVED → FINALIZED
                 ↘ REJECTED
         DRAFT or APPROVED → CANCELLED
```

Indexes on `status` and `createdById` support the common access patterns (list by status, list by creator).

**`StockAdjustmentItem`**

```
StockAdjustmentItem
  requestId  → StockAdjustmentRequest
  productId  → Product
  locationId → Location
  qtyChange  Decimal(15,4)   (positive = increase, negative = decrease)
  reason     String?
  beforeQty  Decimal(15,4)?  (nullable — populated at finalization)
  afterQty   Decimal(15,4)?  (nullable — populated at finalization)
```

`beforeQty` and `afterQty` are snapshots captured at finalization time. They are `null` on DRAFT and SUBMITTED items. For DRAFT requests specifically, the API recomputes these values live from the current `StockBalance` before returning the response — they are not persisted until finalization.

`qtyChange` may be positive or negative but **never zero** (enforced at the application layer).

---

### Stock Transfers

A transfer moves stock from one location to another. It requires approval from both sides and involves reservations.

**`StockTransferRequest`**

Two location references — `sourceLocationId` and `destinationLocationId` — replace the single location used by adjustments. The header tracks two separate approval chains:

| Approval | Fields |
|---|---|
| Origin manager | `originApprovedById`, `originApprovedAt` |
| Destination operator | `destinationApprovedById`, `destinationApprovedAt` |

Status workflow:

```
DRAFT → SUBMITTED → ORIGIN_MANAGER_APPROVED → DESTINATION_OPERATOR_APPROVED
                                                        ↓
                                              READY_TO_FINALIZE → FINALIZED
SUBMITTED or ORIGIN_MANAGER_APPROVED → REJECTED
Any pre-final state → CANCELLED
```

A `StockReservation` is created when `ORIGIN_MANAGER_APPROVED` is set, and is consumed or released when the request reaches a terminal state.

Four indexes support the primary query patterns:

```
@@index([status])
@@index([createdById])
@@index([sourceLocationId])
@@index([destinationLocationId])
```

**`StockTransferItem`**

```
StockTransferItem
  requestId            → StockTransferRequest
  productId            → Product
  qty                  Decimal(15,4)    (always positive)
  beforeQtyOrigin      Decimal(15,4)?
  afterQtyOrigin       Decimal(15,4)?
  beforeQtyDestination Decimal(15,4)?
  afterQtyDestination  Decimal(15,4)?
```

Unlike adjustment items, transfer items reference only `productId` — the locations come from the parent request's `sourceLocationId` and `destinationLocationId`.

All four quantity snapshot fields are nullable and populated at finalization. They record the `onHandQty` at origin and destination both before and after the movement.

---

## 6. Data Integrity Rules

### Enforced by the Schema

| Rule | Mechanism |
|---|---|
| One `StockBalance` row per product-location pair | `@@unique([productId, locationId])` |
| One `ProductLocation` row per product-location pair | `@@unique([productId, locationId])` |
| One role assignment per user per location | `@@unique([userId, locationId])` on `UserLocationRole` |
| Unique request numbers | `@unique` on `requestNumber` |
| Quantities stored without floating-point error | `Decimal(15,4)` on all qty fields |
| Ledger rows have no update timestamp | No `updatedAt` on `StockLedger` |

### Enforced by the Application

| Rule | Enforcement point |
|---|---|
| Stock only changes during finalization | Service layer; all mutations run inside `prisma.$transaction()` |
| Finalization locks the balance row before mutating | Row-level lock (`SELECT FOR UPDATE`) inside the transaction |
| `qtyChange` on adjustment items is never zero | Zod validator on the API layer |
| `reservedQty` never exceeds `onHandQty` | Stock validation before reservation creation |
| Available stock (`onHandQty - reservedQty`) never goes negative | Validated inside the transaction before balance update |
| Ledger rows are never updated or deleted | No update/delete calls to `StockLedger` anywhere in the codebase |

---

## 7. Indexing

All primary keys are UUID `@id` fields, automatically indexed. Beyond that:

| Table | Index | Purpose |
|---|---|---|
| `StockBalance` | `locationId` | Filter stock by warehouse |
| `StockLedger` | `(productId, locationId, createdAt)` | Product-location history queries |
| `StockLedger` | `(locationId, createdAt)` | Location-wide ledger view |
| `StockReservation` | `(productId, locationId)` | Lookup active reservations by product+location |
| `StockReservation` | `(sourceType, sourceId)` | Find reservations by their source request |
| `StockAdjustmentRequest` | `status` | Filter by workflow state |
| `StockAdjustmentRequest` | `createdById` | Filter by creator |
| `StockAdjustmentItem` | `requestId` | Fetch items for a given request |
| `StockTransferRequest` | `status` | Filter by workflow state |
| `StockTransferRequest` | `createdById` | Filter by creator |
| `StockTransferRequest` | `sourceLocationId` | Filter transfers from a location |
| `StockTransferRequest` | `destinationLocationId` | Filter transfers to a location |
| `StockTransferItem` | `requestId` | Fetch items for a given request |
| `AuditLog` | `userId` | Audit trail per user |
| `AuditLog` | `entityType` | Audit trail per entity type |
| `AuditLog` | `timestamp` | Time-range queries on audit history |
| `SavedFilter` | `(createdBy, module)` | Fetch a user's saved filters for a specific module |
