# Product Module

## 1. Purpose

Product is global master data representing a stock-keeping unit (SKU) in the inventory system. It defines *what* an item is — not where it is or whether it is available. Products are shared across all locations and carry no activation logic at the product level.

Availability is managed entirely through **ProductLocation**.

---

## 2. Data Model

### Product

| Field        | Type     | Notes                          |
|--------------|----------|--------------------------------|
| `id`         | UUID     | Primary key                    |
| `sku`        | String   | Unique identifier for the item |
| `name`       | String   |                                |
| `categoryId` | UUID     | FK → Category                  |
| `vendorId`   | UUID     | FK → Vendor                    |
| `uomId`      | UUID     | FK → Unit of Measure           |
| `createdAt`  | DateTime |                                |
| `updatedAt`  | DateTime |                                |

> **No `isActive` field exists on Product.** There is no activation, deactivation, or status flag at the product level.

### ProductLocation

| Field        | Type     | Notes                                      |
|--------------|----------|--------------------------------------------|
| `id`         | UUID     | Primary key                                |
| `productId`  | UUID     | FK → Product                               |
| `locationId` | UUID     | FK → Location                              |
| `isActive`   | Boolean  | Default `false`. Controlled by registration|
| `createdAt`  | DateTime |                                            |
| `updatedAt`  | DateTime |                                            |

Unique constraint: `(productId, locationId)`.

---

## 3. Product Creation Flow

When a product is created via `POST /products`:

1. Validate that the `sku` is unique.
2. Validate that `categoryId`, `vendorId`, and `uomId` reference existing records.
3. Inside a single database transaction:
   - Create the `Product` record.
   - Fetch **all** existing `Location` records.
   - Create one `ProductLocation` entry per location with `isActive: false`.
4. Log an audit entry.

**Key behavior:** Every product is automatically registered at every location at creation time, but starts as inactive at all of them. No manual step is needed to create the ProductLocation rows — this is handled atomically.

If new locations are added to the system after a product exists, a backfill migration ensures the missing ProductLocation rows are created (also with `isActive: false`).

---

## 4. Relationship with ProductLocation

ProductLocation is the **single source of truth for product availability**.

- A product with no `ProductLocation` row at a given location is treated as inactive at that location.
- A product with a `ProductLocation` row where `isActive: false` is also inactive.
- A product is available at a location only when its `ProductLocation.isActive === true`.

The Product record itself never changes to reflect availability. All availability state lives in `ProductLocation`.

---

## 5. How Product Is Used in Other Modules

### Product Registration
- Manages the `ProductLocation.isActive` flag.
- Activating a product at a location sets `isActive: true`.
- Deactivation is blocked if there are pending adjustment or transfer requests for that product at that location.

### Stock
- `StockBalance` tracks `onHandQty` and `reservedQty` per `(productId, locationId)`.
- Product fields (`sku`, `name`, `category`, `uom`) are included in stock overview queries.

### Stock Adjustments
- Each adjustment item references a `productId`.
- Before an item is accepted, the system validates that `ProductLocation.isActive === true` for the target location.
- Adjustments are blocked for inactive products.

### Stock Transfers (Movements)
- Each transfer item references a `productId`.
- Both the origin and destination locations must have `isActive === true` for the product.
- Transfers are blocked if either side has an inactive registration.

---

## 6. Key Rules / Constraints

- **Product has no activation logic.** There is no `isActive`, `status`, or enabled flag on the Product model.
- **ProductLocation is created automatically** for every location when a product is created. This is done atomically in the same transaction as the product itself.
- **Default availability is inactive.** All auto-created `ProductLocation` rows start with `isActive: false`. A product must be explicitly registered (activated) at each location before it can be used there.
- **SKU must be unique** across all products.
- **Products cannot be deleted** if they are referenced by stock, adjustments, or transfers.
- **Deactivation is blocked** at the ProductLocation level if pending requests exist for that product-location pair.
- All product creation and registration actions are recorded in the audit log.
