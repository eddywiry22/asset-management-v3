# Product Registration Module

## 1. Purpose

Product Registration controls which products are **active at which locations**. It does not create product-location pairings — those are created automatically when a product is added to the system. This module is purely about **activation, not creation**.

A product must be active at a location before it can be used in stock adjustments, transfers, or any inventory operation at that location.

---

## 2. ProductLocation Model

| Field        | Type     | Notes                                         |
|--------------|----------|-----------------------------------------------|
| `id`         | UUID     | Primary key                                   |
| `productId`  | UUID     | FK → Product                                  |
| `locationId` | UUID     | FK → Location                                 |
| `isActive`   | Boolean  | `false` by default. Toggled via registration. |
| `createdAt`  | DateTime |                                               |
| `updatedAt`  | DateTime |                                               |

Unique constraint: `(productId, locationId)`.

### Full Matrix — No Manual Pairing

The system maintains a **complete product-location matrix**: every product has a `ProductLocation` row for every location. These rows are created automatically when a product is created (and backfilled when a new location is added).

**Operators never create a product-location pairing manually.** The pairing already exists. The only action available is toggling `isActive`.

### What `isActive` Means

| State           | Meaning                                              |
|-----------------|------------------------------------------------------|
| `isActive: true`  | Product is available at that location for all operations |
| `isActive: false` | Product is unavailable; blocked from adjustments and transfers |

There is no intermediate state. Missing rows are treated identically to `isActive: false`.

---

## 3. Activation Workflow

### Single Toggle

`PUT /admin/product-registrations/:id`

```json
{ "isActive": true }
```

1. Fetch the existing `ProductLocation` record.
2. If deactivating (`true → false`): run the blocking check (see Section 5).
3. Update `isActive`.
4. Write audit log entry.

### Pre-flight Deactivation Check

`GET /admin/product-registrations/:id/check-deactivate`

Returns whether the record can safely be deactivated, along with counts of blocking requests:

```json
{
  "canDeactivate": false,
  "pendingCount": 3,
  "adjustments": 2,
  "transfers": 1
}
```

The UI calls this endpoint when opening the edit dialog on an active registration, and disables the deactivate toggle if `canDeactivate: false`.

---

## 4. Bulk Operations

`POST /admin/product-registrations/bulk-toggle`

```json
{
  "ids": ["uuid-1", "uuid-2", "uuid-3"],
  "isActive": false
}
```

- Accepts 1–100 IDs per request.
- Processes each record independently.
- **Supports partial success**: items that pass validation are updated; blocked items are skipped and reported.
- Returns a summary:

```json
{
  "successCount": 2,
  "failed": [
    { "id": "uuid-2", "reason": "HAS_PENDING_REQUEST" }
  ]
}
```

### Failure Reason Codes

| Code                 | Meaning                                              |
|----------------------|------------------------------------------------------|
| `NOT_FOUND`          | The `ProductLocation` record does not exist          |
| `HAS_PENDING_REQUEST`| Deactivation blocked by one or more pending requests |

Bulk activation (setting `isActive: true`) never fails due to blocking logic — blocking only applies to deactivation.

---

## 5. Blocking Logic

Deactivation of a `ProductLocation` is **blocked** when any non-terminal adjustment or transfer request references that product at that location.

### Non-terminal Statuses

Requests are considered "pending" (blocking) if their status is **not** one of:

- `FINALIZED`
- `CANCELLED`
- `REJECTED`

### What Is Checked

| Request Type          | Condition                                                                 |
|-----------------------|---------------------------------------------------------------------------|
| StockAdjustmentRequest | Has items with matching `productId` at matching `locationId`, and non-terminal status |
| StockTransferRequest   | Has items with matching `productId`, and `sourceLocationId` or `destinationLocationId` matches, and non-terminal status |

### Error

When deactivation is blocked, the system returns HTTP 400:

```
Cannot deactivate this product at this location while there are pending requests
(2 adjustment(s), 1 transfer(s)). Resolve them first.
```

The operator must finalize, cancel, or reject all blocking requests before deactivation is permitted.

### Edge Cases

- **Bulk deactivation, some blocked**: The unblocked items are updated successfully. Blocked items appear in the `failed` array with reason `HAS_PENDING_REQUEST`. The caller receives both the success count and the failure list.
- **Activation is never blocked**: Setting `isActive: true` always succeeds (assuming the record exists).
- **Already in target state**: The update proceeds without error; the record is written with the same value.

---

## 6. Filters & Presets

### Basic Filters

| Parameter     | Type       | Description                               |
|---------------|------------|-------------------------------------------|
| `status`      | Enum       | `ALL` \| `ACTIVE` \| `INACTIVE` (default: `ALL`) |
| `productIds`  | UUID[]     | Filter by one or more products            |
| `locationIds` | UUID[]     | Filter by one or more locations           |
| `categoryIds` | UUID[]     | Filter by product category                |
| `page`        | Int        | Default: 1                                |
| `pageSize`    | Int        | Default: 20, max: 100                     |

`productId` / `locationId` (singular) are also accepted and normalized to their array equivalents. A request cannot mix singular and plural forms for the same field.

### Advanced Filters

The UI provides a multi-select modal with three tabs: **Categories**, **Products**, **Locations**. Each tab supports text search and "Select All / Clear" shortcuts.

Selecting categories automatically removes any selected products that no longer belong to those categories.

### Saved Presets

Filter states can be saved and reused via the SavedFilter system.

**SavedFilter model:**

| Field        | Type     | Notes                                      |
|--------------|----------|--------------------------------------------|
| `id`         | UUID     |                                            |
| `name`       | String   | User-provided label                        |
| `module`     | String   | Scoped to module (e.g. `PRODUCT_REGISTRATION`) |
| `filterJson` | JSON     | Full filter state serialized as JSON       |
| `createdBy`  | String   | FK → User                                  |
| `createdAt`  | DateTime |                                            |

Saved presets are **per-user and per-module**. One user's presets are not visible to others.

**Stored filter shape:**
```json
{
  "categoryIds": ["..."],
  "productIds": ["..."],
  "locationIds": ["..."],
  "status": "ACTIVE"
}
```

Applying a preset restores the full filter state including status. Presets can be deleted by their owner only.

---

## 7. Key Rules

- **No manual pairing.** Product-location rows are created by the system. Operators only activate or deactivate.
- **Activation is the gate.** A product that is not active at a location cannot appear in adjustments, transfers, or any inventory request at that location.
- **Deactivation can be blocked.** Any non-terminal adjustment or transfer request involving the product at that location prevents deactivation until the request reaches a terminal state.
- **Bulk operations are partially atomic.** Each record in a bulk toggle is processed independently. Some can succeed while others fail. The caller is responsible for inspecting the `failed` array.
- **Audit trail is mandatory.** Every activation and deactivation — single or bulk — is written to the audit log with the acting user's ID.
- **Delete is not supported.** `ProductLocation` rows are permanent. The only permitted mutation is toggling `isActive`. Attempting a delete returns HTTP 400.
