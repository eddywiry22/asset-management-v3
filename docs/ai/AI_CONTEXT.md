# AI Context Document — Asset Management v3

> **Purpose**: Primary context for AI sessions working on this codebase. Read this first. Do not duplicate; follow the Documentation Map at the bottom for deeper detail.

---

## 1. System Overview

A **multi-location warehouse inventory management system** built on Node.js + TypeScript + Express + Prisma + MySQL 8.

Core function: track stock levels across physical locations with structured approval workflows for all stock changes. No stock mutation happens outside of a finalized, approved request. Every change is permanent and traceable through an immutable ledger.

**Key capabilities:**
- Multi-location inventory with per-location product activation
- Stock tracking via immutable append-only ledger
- Adjustment workflow (single-location stock changes)
- Movement/Transfer workflow (inter-location stock moves with reservations)
- Advanced multi-dimensional filtering with saved presets
- Role-based access: Operator, Manager, Admin
- Dashboard with personal action queue ("My Actions")

**Stack:** Node.js · TypeScript · Express · Prisma ORM · MySQL 8 · Zod · JWT · Winston

---

## 2. Core Design Principles

> These principles explain *why* the system works the way it does. Violating them is a bug.

1. **Stock changes only at finalization.** Approval, reservation, and submission steps never touch `onHandQty`. Changes commit atomically at `FINALIZED` status — never earlier.

2. **Immutable ledger.** `StockLedger` rows are written once and never updated or deleted. It is the authoritative, append-only record of what happened to inventory. Corrections must be made via new opposing requests.

3. **Every stock mutation is transactional.** Lock → validate → mutate → write ledger — all inside a single `prisma.$transaction`. Partial writes are never acceptable.

4. **Hard reservations for transfers; soft validation for adjustments.** Transfers lock origin stock (`reservedQty`) the moment the origin manager approves. This prevents concurrent requests from consuming the same units before the transfer finalizes.

5. **Availability formula always includes reserved stock:**
   ```
   availableQty = max(0, onHandQty - reservedQty)
   ```
   Never use `onHandQty` alone for availability checks.

6. **ProductLocation controls all availability.** A product has no `isActive` flag of its own. Availability is entirely determined by `ProductLocation.isActive` per location. The matrix is always complete (auto-created, inactive by default).

7. **Location-scoped access.** Non-admin users are scoped to assigned locations. All list queries and workflow actions are filtered/blocked by location assignment.

8. **Optimistic concurrency on status transitions.** Status updates use `updateMany WHERE status = <expected>`. If `count = 0`, a concurrent process already changed status — abort, do not retry blindly.

---

## 3. Core Data Model

### Entity Relationships (simplified)

```
Category ──┐
Vendor  ──►├── Product ──► ProductLocation ◄── Location ◄── UserLocationRole ◄── User
Uom     ──┘       │
                  ▼
        StockBalance (onHandQty, reservedQty)
        StockLedger  (immutable, append-only)
        StockReservation (ACTIVE → RELEASED/CONSUMED)
                  ▲
       StockAdjustmentRequest ──► StockAdjustmentItem
       StockTransferRequest   ──► StockTransferItem
```

### Critical Fields

| Entity | Critical Fields | Notes |
|---|---|---|
| `User` | `isAdmin`, `isActive` | `isAdmin` is a global bypass flag; not a role |
| `Location` | `code`, `isActive` | Inactive = hard block on all operations |
| `Product` | `sku` | **No `isActive`** — availability is via ProductLocation |
| `ProductLocation` | `isActive` (default `false`) | The sole availability gate per product/location |
| `StockBalance` | `onHandQty`, `reservedQty` | `reservedQty` is a cached sum; authoritative = live `ACTIVE` reservations |
| `StockLedger` | `changeQty`, `balanceAfter`, `sourceType`, `sourceId` | No `updatedAt`; written once, never touched |
| `StockReservation` | `qty`, `status` (`ACTIVE`→`RELEASED`/`CONSUMED`) | Created at origin manager approval |
| `UserLocationRole` | `(userId, locationId)` unique, `role`: `OPERATOR`\|`MANAGER` | One role per user per location |

### ProductLocation Auto-Creation

- New product created → `ProductLocation` row auto-created for **every existing location** (inactive)
- New location created → `ProductLocation` row auto-created for **every existing product** (inactive)
- Matrix is always complete. Operators never create rows — they only activate/deactivate.

---

## 4. Key Workflows

### Adjustment Workflow (single location)

```
DRAFT → SUBMITTED → APPROVED → FINALIZED
                 ↘ REJECTED (terminal)
         ↘ CANCELLED (from DRAFT or APPROVED)
```

| Step | Actor | Stock Effect |
|---|---|---|
| Create/Submit | Operator or Manager | None |
| Approve | Manager at item location | None (validates availability for negative changes) |
| Finalize | Operator or Manager at item location | `onHandQty += qtyChange` · StockLedger written · all in one transaction |
| Reject | Manager | None |
| Cancel | Creator or Manager (from DRAFT/APPROVED) | None |

**No reservations used.** Availability re-validated under lock at finalization.

### Transfer Workflow (two locations)

```
DRAFT → SUBMITTED → ORIGIN_MANAGER_APPROVED → DESTINATION_OPERATOR_APPROVED → FINALIZED
                  ↘ REJECTED (terminal)
        ↘ CANCELLED (any pre-final stage)
```

| Step | Actor | Stock Effect |
|---|---|---|
| Create/Submit | Any authenticated user | None |
| Origin approval | Manager at **source** location | `StockReservation` created · `reservedQty` incremented at origin |
| Destination approval | Operator or Manager at **destination** location | None |
| Finalize | Any eligible user | Origin: `onHandQty -= qty`, `reservedQty -= qty`, reservation → CONSUMED, TRANSFER_OUT ledger · Destination: `onHandQty += qty`, TRANSFER_IN ledger |
| Reject/Cancel | Per role rules | If reservations exist → released atomically, `reservedQty` decremented |

**Reservations are created at origin manager approval** — not at submission. This prevents stock from being locked without managerial oversight.

---

## 5. Filtering System

### Two Tiers

| Type | UI | Behavior |
|---|---|---|
| Simple filter | Single-select dropdown | Converted to 1-element array internally; staged, applied on confirm |
| Advanced filter | Multi-select modal with tabs | Searchable; products auto-filter by selected categories; staged, applied on Apply |

### Filter Logic

- **Across dimensions**: AND — results must satisfy all active dimensions simultaneously
- **Within a dimension**: OR — `productIds = [X, Y]` → `WHERE productId IN ('X', 'Y')`
- Undefined or empty array = no filter on that dimension
- Apply resets page to 0; preserves other active filters

### Filter State Shape

```typescript
type Filters = {
  categoryIds?: string[];
  productIds?:  string[];
  locationIds?: string[];
  vendorIds?:   string[];   // products module only
  startDate?:   string;     // YYYY-MM-DD
  endDate?:     string;     // YYYY-MM-DD
};
```

### Saved Presets

- Stored as JSON per user per module (`STOCK`, `PRODUCTS`, `PRODUCT_REGISTRATION`)
- Applying a preset **fully replaces** current filters — not merged
- Users may only delete their own presets

---

## 6. Module Overview

```
src/modules/
├── auth/                  # Login, JWT token generation/refresh
├── users/                 # User lookup (shared service/repo)
├── admin-users/           # Admin CRUD for non-admin users
├── products/              # Master product catalog
├── product-registrations/ # ProductLocation activation/deactivation
├── categories/            # Product categories master
├── vendors/               # Vendor master data
├── uoms/                  # Units of measure
├── locations/             # Warehouse location master
├── stock/                 # Balances, ledger, reservations (read-only views)
├── stock-adjustments/     # Adjustment workflow
├── stock-transfers/       # Transfer workflow
├── dashboard/             # Aggregated metrics + "My Actions" queue
├── saved-filters/         # User-saved filter presets
└── audit/                 # Audit log read access (admin only)
```

Each module follows: `controller → service → repository` with Zod validators and route definitions.

**Request flow:** `JWT auth → [admin guard] → [Zod validation] → controller → service → repository → Prisma → MySQL`

**API prefix:** `/api/v1/`
**Admin routes:** `/api/v1/admin/*` — require `isAdmin: true`
**Response envelope:** `{ success: boolean, data?: any, error?: { code, message } }`

---

## 7. Permission Model

### Two-Tier Authorization

**Tier 1 — Global Admin flag** (`User.isAdmin`)
- Bypasses all location-level permission checks
- Cannot be set via API; created directly in database
- Cannot modify/deactivate/reset other admin users via API

**Tier 2 — Location-Scoped Role** (`UserLocationRole`)
- One row per `(userId, locationId)` — unique constraint
- Role values: `OPERATOR` | `MANAGER` (no "ADMIN" in the enum)

### Role Capabilities

| Action | Operator | Manager | Admin |
|---|:---:|:---:|:---:|
| View stock at assigned locations | ✓ | ✓ | ✓ (all) |
| Create / submit requests | ✓ | ✓ | ✓ |
| Finalize approved adjustments | ✓ | ✓ | ✓ |
| Approve / reject adjustments | ✗ | ✓ | ✓ |
| Approve origin step of transfer | ✗ | ✓ (at source) | ✓ |
| Approve destination step of transfer | ✓ (at dest) | ✓ (at dest) | ✓ |
| Cancel (own or location requests) | Own only | Location | All |
| Access `/v1/admin/*` routes | ✗ | ✗ | ✓ |
| Manage master data / users | ✗ | ✗ | ✓ |

### Access Enforcement

- **Route-level**: `adminMiddleware` on `/v1/admin/*`
- **Service-level**: `assertUserCanAccessLocation(userId, isAdmin, locationId)` — throws `ForbiddenError` if no `UserLocationRole` found
- **List queries**: Non-admins automatically scoped to assigned `locationIds`

---

## 8. Known Constraints / Gotchas

> Read carefully. These are the most common sources of bugs and incorrect assumptions.

### Stock Integrity (Non-Negotiable)

- **`onHandQty` only changes at finalization.** Nowhere else. Ever.
- **Availability = `onHandQty - reservedQty`**, not `onHandQty` alone. Using raw `onHandQty` for availability checks is a bug.
- **Lock before read before mutate.** Sequence: `SELECT FOR UPDATE → read → validate → mutate → write ledger`. TOCTOU bugs occur if you read outside the lock.
- **Ledger is append-only.** No update/delete methods exist or should ever be added on `StockLedger`. Corrections require new requests.
- **All stock operations inside a single transaction.** `onHandQty`, `reservedQty`, `StockReservation.status`, and `StockLedger` must commit together.

### Reservation Rules

- Reservations are created at **origin manager approval** — not at submission.
- Cancelling or rejecting a request with `ACTIVE` reservations must release them in the same transaction.
- `reservedQty` cache must be updated whenever reservations change (create, release, consume).
- Missing expected reservations at finalization time is a hard error — do not proceed.

### ProductLocation Rules

- `Product` has **no `isActive` field**. Product availability is **always** via `ProductLocation.isActive`.
- `ProductLocation` rows are **auto-created inactive** on product or location creation. Never manually create them.
- Attempting to use a product at a location where `ProductLocation.isActive = false` is blocked at every workflow step.

### Inactive Entity Hard Blocks

- Inactive **location** → blocks all operations involving that location
- Inactive **product registration** (`ProductLocation.isActive = false`) → blocks create, approve, finalize
- Inactive **user** → cannot be assigned to any workflow approval
- **Deactivating a user** is blocked if they are the sole eligible participant in any pending workflow

### Concurrency

- Status transitions use `updateMany WHERE status = <expected>`. If `count = 0`, abort — do not retry the same operation. A concurrent process already changed status.
- Finalization must re-validate stock under lock even if approval already validated it. Time elapses between approval and finalization.

### Other Gotchas

- `balanceAfter` in ledger entries must be captured from the row *after* mutation, within the same transaction. Using a pre-computed value introduces drift.
- Ledger entries are **only** written for events that change `onHandQty` (ADJUSTMENT, TRANSFER_OUT, TRANSFER_IN, SEED). Approvals, rejections, cancellations, and reservation changes produce no ledger entries.
- Admin users cannot be created, updated, deactivated, or have their passwords reset via API.
- A Manager at the source location cannot perform the destination approval step unless they are also assigned to the destination location.

---

## 9. Extension Guidelines for AI

> Follow these rules when adding features, fixing bugs, or modifying the system.

### Before Writing Any Code

1. **Read the relevant module files** (`controller`, `service`, `repository`, `validator`). Do not assume structure.
2. **Identify whether the change touches stock.** If yes, all 18 stock integrity rules in the architecture docs apply.
3. **Check the permission model.** Determine which roles can perform the action, at which location, and how enforcement is applied.

### Adding a New Workflow Step or Status

- Map the full state machine before writing code
- Every status transition that has side effects (stock changes, reservations) must be fully atomic in one transaction
- Add optimistic concurrency (`updateMany WHERE status = <expected>`)
- Do not change `onHandQty` at any step other than finalization

### Adding New Stock Operations

- Must follow: lock → read → validate availability → mutate `onHandQty` → decrement/increment `reservedQty` if applicable → write `StockLedger` entry — all in one transaction
- `availableQty = max(0, onHandQty - reservedQty)` — always check this, never raw `onHandQty`
- `balanceAfter` in ledger = value of `onHandQty` captured after mutation, inside the transaction
- Never add update/delete methods to `StockLedger`

### Adding Filtering

- Follow the existing filter shape: multi-value dimensions are `string[]`, each undefined by default
- AND across dimensions, OR within a dimension (IN clause)
- Respect location scoping for non-admin users; apply as additional constraint, not a replacement

### Adding a New Module

- Follow the `controller → service → repository` pattern
- Add route registration in `app.ts`
- Use `validateBody(zodSchema)` for any request with a body
- Use `authMiddleware` on all protected routes; `adminMiddleware` for admin-only routes
- Throw `AppError` subclasses (`ValidationError`, `NotFoundError`, `ForbiddenError`) — never raw `Error`
- Return the standard envelope: `{ success: true, data: ... }`

### Modifying ProductLocation Logic

- Do not add an `isActive` flag to `Product`. Availability is always location-scoped.
- Do not remove auto-creation logic — the complete matrix is a system invariant.
- If adding new location/product types, verify the auto-creation hooks still fire.

### What NOT to Do

- Do not mutate `onHandQty` outside of a finalization handler
- Do not delete or update `StockLedger` rows
- Do not add new `StockReservation` status values without updating all lifecycle handlers
- Do not add admin-user management routes via API (hard policy)
- Do not bypass `assertUserCanAccessLocation` for non-admin users
- Do not use `onHandQty` alone as available quantity

---

## 10. Documentation Map

Detailed documentation is organized as follows. Consult these for deep-dive specifics.

| Path | Contents |
|---|---|
| `/docs/architecture/` | System design, data model ERD, module structure, request lifecycle |
| `/docs/api/` | Endpoint reference: request/response schemas, status codes, error codes |
| `/docs/fsd/` | Functional specification: business rules, workflow state machines, edge cases |
| `/docs/engineering/` | Implementation patterns, transaction discipline, concurrency model |
| `/docs/modules/` | Per-module deep-dives: stock, adjustments, transfers, filtering, dashboard |
| `/docs/diagrams/` | Visual ERDs, workflow state diagrams, sequence diagrams |
| `/docs/ux/` | UI flows, filter behavior, action queue, role-based UI differences |
| `/docs/testing/` | Test strategy, coverage expectations, test data setup |

> **Start here → consult architecture → check fsd for business rules → check engineering for implementation discipline.**
