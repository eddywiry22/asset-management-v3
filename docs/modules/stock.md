# Stock Module

## 1. Purpose

The Stock module tracks the current inventory state and full movement history for every product at every location. It is **read-only from an operator's perspective** — stock cannot be modified directly. All changes to quantity flow exclusively through finalized Adjustments and finalized Transfers.

The module exposes two complementary views:
- **StockBalance** — the current state (what is on hand right now).
- **StockLedger** — the immutable history (every change that ever happened).

---

## 2. Data Models

### StockBalance

One row per `(productId, locationId)` pair. Represents the live inventory state.

| Field        | Type          | Notes                                      |
|--------------|---------------|--------------------------------------------|
| `id`         | UUID          | Primary key                                |
| `productId`  | UUID          | FK → Product                               |
| `locationId` | UUID          | FK → Location                              |
| `onHandQty`  | Decimal(15,4) | Total physical quantity present            |
| `reservedQty`| Decimal(15,4) | Cached sum of active reservations          |
| `updatedAt`  | DateTime      | Auto-updated on every write                |

Unique constraint: `(productId, locationId)`.

`availableQty` is a derived value — not stored:

```
availableQty = max(0, onHandQty − reservedQty)
```

### StockLedger

One row per stock-changing event. **Append-only and immutable** — rows are never updated or deleted.

| Field         | Type          | Notes                                                   |
|---------------|---------------|---------------------------------------------------------|
| `id`          | UUID          | Primary key                                             |
| `productId`   | UUID          | FK → Product                                            |
| `locationId`  | UUID          | FK → Location                                           |
| `changeQty`   | Decimal(15,4) | Positive = stock added, negative = stock removed        |
| `balanceAfter`| Decimal(15,4) | The `onHandQty` immediately after this change           |
| `sourceType`  | Enum          | Origin of the change (see table below)                  |
| `sourceId`    | String        | ID of the source document (adjustment or transfer)      |
| `createdAt`   | DateTime      | Written once at creation; never changed                 |

**Source types:**

| Value          | When created                                      |
|----------------|---------------------------------------------------|
| `ADJUSTMENT`   | Stock adjustment request finalized                |
| `TRANSFER_OUT` | Transfer finalized — source location deducted     |
| `TRANSFER_IN`  | Transfer finalized — destination location credited|
| `SEED`         | Historical opening balance (data migration only)  |
| `MOVEMENT_OUT` | Movement finalized — source location deducted (reserved for future use; not currently produced) |
| `MOVEMENT_IN`  | Movement finalized — destination location credited (reserved for future use; not currently produced) |

### StockReservation

One row per reserved line item. The **authoritative source** for reservation state.

| Field          | Type   | Notes                                              |
|----------------|--------|----------------------------------------------------|
| `id`           | UUID   |                                                    |
| `productId`    | UUID   |                                                    |
| `locationId`   | UUID   |                                                    |
| `qty`          | Decimal|                                                    |
| `sourceType`   | Enum   | `TRANSFER` or `ADJUSTMENT`                         |
| `sourceId`     | String | The request ID                                     |
| `sourceItemId` | String | The line-item ID within the request                |
| `status`       | Enum   | `ACTIVE`, `RELEASED`, or `CONSUMED`                |

`StockBalance.reservedQty` is a **cache** of `SUM(StockReservation.qty WHERE status = ACTIVE)`. It is kept in sync by the same transactions that write to `StockReservation`. The authoritative available quantity is always computed against the `StockReservation` table, not the cached field.

---

## 3. Stock Calculation

### Current State

```
onHandQty   = total physical units present at this location
reservedQty = units locked by pending requests (cached)
availableQty = max(0, onHandQty − reservedQty)
```

`availableQty` is what can be freely allocated. It decreases when reservations are created and increases when they are released or consumed.

### Period View (Historical)

When a date range (`startDate` / `endDate`) is supplied to the stock overview, the system recalculates from the ledger:

```
startingQty  = balanceAfter of the last ledger entry before startDate
inboundQty   = SUM of positive changeQty entries within the period
               (sourceType: ADJUSTMENT, TRANSFER_IN, SEED, MOVEMENT_IN)
outboundQty  = SUM of ABS(negative changeQty) entries within the period
               (sourceType: TRANSFER_OUT, MOVEMENT_OUT)
finalQty     = startingQty + inboundQty − outboundQty
```

This allows auditors to reconstruct the inventory state at any point in time without relying on snapshots.

### Concurrency Safety

All writes to `StockBalance` use row-level locking (`SELECT FOR UPDATE`) inside a database transaction. This prevents double-spending if two requests attempt to consume the same stock simultaneously. Status updates use optimistic concurrency (`WHERE status = <expected>`) to detect conflicting writes.

---

## 4. Reservation Logic

Reservations protect stock from being consumed by two competing operations at the same time. A reservation is created when a transfer request is approved by the origin manager, before the stock is physically moved.

### Lifecycle

```
[Transfer approved by origin manager]
        ↓
  StockReservation created (status = ACTIVE)
  StockBalance.reservedQty incremented
  availableQty reduced immediately
        ↓
  [Transfer cancelled or rejected]          [Transfer finalized]
        ↓                                          ↓
  StockReservation → RELEASED            StockReservation → CONSUMED
  StockBalance.reservedQty decremented   onHandQty decremented (source)
  availableQty restored                  onHandQty incremented (destination)
                                         reservedQty decremented (source)
                                         TRANSFER_OUT + TRANSFER_IN ledger entries written
```

### Validation at Reservation Time

Before creating a reservation, the system computes:

```
availableQty = onHandQty − SUM(StockReservation.qty WHERE status = ACTIVE)
```

If `qty > availableQty`, the reservation is rejected with a `ValidationError`. The check and write happen inside a single locked transaction so no concurrent request can observe the same available quantity.

### Adjustment Reservations

Adjustments that reduce stock (`qtyChange < 0`) validate available quantity at **finalization time**, not at approval time. There is no prior reservation for adjustments — the stock is deducted atomically when the request is finalized.

---

## 5. Finalization Rules

**Stock changes only on finalization. Approving a request does not touch StockBalance or StockLedger (except reservations for transfers).**

### Adjustment Finalization

Triggered by: `POST /adjustments/:id/finalize` with status `APPROVED`.

Pre-conditions (all must pass):
1. Request status is `APPROVED`.
2. All item locations are active (`Location.isActive = true`).
3. All products are still active at their locations (`ProductLocation.isActive = true`).
4. At least one eligible user (OPERATOR or MANAGER) exists at each item location.

Atomic transaction:
1. Status updated `APPROVED → FINALIZED` (conditional on current status to prevent double-finalize).
2. For each item: `onHandQty` incremented or decremented by `qtyChange`.
3. For each item: one `ADJUSTMENT` ledger entry written.

If any item has `qtyChange < 0` and `availableQty < |qtyChange|`, the entire transaction rolls back.

### Transfer Finalization

Triggered by: `POST /transfers/:id/finalize` with status `READY_TO_FINALIZE`.

Pre-conditions (all must pass):
1. Request status is `READY_TO_FINALIZE` (both origin and destination approvals are complete).
2. Source and destination locations are active.
3. All products are active at the destination location.
4. At least one eligible user exists at the destination location.
5. Active `StockReservation` records exist for this transfer (absence means they were already consumed or released — a hard error).

Atomic transaction:
1. Status updated `READY_TO_FINALIZE → FINALIZED`.
2. For each reservation:
   - Source `onHandQty` decremented.
   - Source `reservedQty` decremented.
   - `StockReservation.status` → `CONSUMED`.
   - `TRANSFER_OUT` ledger entry written at source.
   - Destination `onHandQty` incremented.
   - `TRANSFER_IN` ledger entry written at destination.

### Blocking Conditions Summary

| Condition | Adjustment | Transfer |
|-----------|-----------|---------|
| Wrong status | Blocked | Blocked |
| Location inactive | Blocked | Blocked |
| Product inactive at location | Blocked at finalize | Blocked at finalize |
| Insufficient available stock | Blocked at finalize | Blocked at reservation |
| No eligible users at location | Blocked at finalize | Blocked at finalize |
| No active reservations | N/A | Blocked at finalize |

---

## 6. Filters

### Stock Overview (`GET /v1/stock`)

| Parameter    | Type     | Description                                      |
|--------------|----------|--------------------------------------------------|
| `locationIds`| UUID[]   | Filter to specific locations                     |
| `productIds` | UUID[]   | Filter to specific products                      |
| `categoryIds`| UUID[]   | Filter by product category                       |
| `startDate`  | ISO 8601 | Period start — enables historical metrics        |
| `endDate`    | ISO 8601 | Period end                                       |
| `page`       | Int      | Default: 1                                       |
| `limit`      | Int      | Default: 20, max: 100                            |

Singular forms (`locationId`, `productId`) are also accepted and normalized to their array equivalents. All active filters are applied as AND conditions.

**Access control:** Non-admin users only see locations they have an assigned role at. Requests for other locations are silently excluded (not rejected), so the result set may be smaller than expected for scoped users.

### Stock Ledger (`GET /v1/stock/ledger`)

| Parameter    | Type     | Description                     |
|--------------|----------|---------------------------------|
| `locationIds`| UUID[]   | Filter by location               |
| `productIds` | UUID[]   | Filter by product                |
| `startDate`  | ISO 8601 | Start of date range              |
| `endDate`    | ISO 8601 | End of date range                |
| `page`       | Int      | Pagination                       |
| `limit`      | Int      | Default: 20, max: 100            |

Non-admin users requesting a restricted location receive a `403 Forbidden`.

Results are ordered by `createdAt DESC` (most recent first).

### Supporting Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /v1/stock/locations` | Locations visible to the current user (with `isActive` flag) |
| `GET /v1/stock/all-locations` | All active locations (used for transfer destination picker) |
| `GET /v1/stock/registered-products?locationId=` | Products with `ProductLocation.isActive = true` at that location |

---

## 7. Key Constraints

- **Stock is never modified directly.** There is no endpoint to set or patch a quantity. The only path to changing `onHandQty` is through a finalized adjustment or finalized transfer.
- **StockLedger is immutable.** Rows are never updated or deleted. Every ledger entry is a permanent record of a real stock event.
- **Available quantity is the operative number.** Operations validate against `availableQty` (onHand minus active reservations), not raw `onHandQty`. Reservations are binding the moment they are created.
- **`StockBalance.reservedQty` is a cache.** The authoritative reservation sum always comes from aggregating `StockReservation` rows with `status = ACTIVE`. The cache is kept in sync within transactions.
- **Finalization is all-or-nothing.** If any item in an adjustment or any reservation in a transfer fails its stock check, the entire finalization transaction rolls back. There is no partial finalization.
- **Inactive product registrations block finalization.** If a product is deactivated at a location between approval and finalization, the finalize call is rejected. The product must be reactivated or the item removed before proceeding.
- **Ledger enables full historical reconstruction.** Given any point in time, the inventory balance can be derived entirely from ledger entries without relying on balance snapshots.
