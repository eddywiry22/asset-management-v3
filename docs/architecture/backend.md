# Backend Architecture

## 1. Overview

The backend is a REST API built with **Node.js**, **Express**, and **TypeScript**. It follows a modular, domain-driven structure where each business domain owns its own controllers, services, repositories, validators, and routes.

**Stack:**

| Layer | Technology |
|---|---|
| Runtime | Node.js + TypeScript |
| Framework | Express |
| ORM | Prisma |
| Database | MySQL 8 |
| Validation | Zod |
| Authentication | JWT (access + refresh tokens) |
| Logging | Winston |

All routes are versioned under `/v1`. The entry point is `src/app.ts`, which assembles the middleware chain and mounts all routers.

---

## 2. Project Structure

```
src/
├── app.ts                        # Express app assembly, route mounting
├── server.ts                     # HTTP server bootstrap
├── config/
│   ├── database.ts               # Prisma client singleton
│   └── env.ts                    # Environment variable loading + validation
├── middlewares/
│   ├── auth.middleware.ts         # JWT verification, attaches user to req
│   ├── admin.middleware.ts        # Requires isAdmin = true
│   ├── error.middleware.ts        # Centralized error formatting
│   └── request-logger.middleware.ts # HTTP request/response logging
├── modules/
│   ├── auth/                     # Login, token generation
│   ├── users/                    # User lookup (service + repository only)
│   ├── admin-users/              # Admin user management (CRUD)
│   ├── products/                 # Product master data
│   ├── product-registrations/    # ProductLocation activation per location
│   ├── categories/               # Product categories
│   ├── vendors/                  # Vendor master data
│   ├── uoms/                     # Units of measure
│   ├── locations/                # Warehouse locations + readiness evaluation
│   ├── stock/                    # Stock balances, ledger, reservations
│   ├── stock-adjustments/        # Adjustment request workflow
│   ├── stock-transfers/          # Transfer request workflow
│   ├── dashboard/                # Aggregated metrics for dashboard views
│   ├── saved-filters/            # User-saved query filter presets
│   ├── audit/                    # Audit log read access
│   ├── attachments/              # File upload, download, delete for requests
│   ├── comments/                 # Comment CRUD for requests
│   ├── timeline/                 # Unified activity feed (REST + SSE)
│   └── reports/                  # Stock Opname report generation
├── services/
│   └── audit.service.ts          # Centralized audit log writer (shared)
├── types/
│   ├── auth.types.ts             # AuthUser, TokenPayload, LoginResponse
│   └── request.types.ts          # AuthenticatedRequest (extends Express Request)
└── utils/
    ├── errors.ts                 # Custom error class hierarchy
    ├── guards.ts                 # Location access enforcement
    ├── validation.ts             # validateBody() middleware factory
    ├── validationHelpers.ts      # ProductLocation + location status checks
    ├── dateFilter.ts             # Date range normalization utilities
    └── logger.ts                 # Winston logger instance
```

> **Note:** `modules/adjustments/` and `modules/movements/` are empty placeholder directories. The implemented modules are `stock-adjustments/` and `stock-transfers/`.
> `modules/goods/` contains a full implementation (controller, service, repository, routes) but is **not imported or mounted in `app.ts`** and is not reachable via any API route.

### Module File Conventions

Each active module follows a consistent internal layout:

```
<module>/
├── <module>.controller.ts    # HTTP request handling, response shaping
├── <module>.service.ts       # Business logic, orchestration
├── <module>.repository.ts    # Database queries via Prisma
├── <module>.routes.ts        # Route definitions, middleware attachment
├── <module>.validator.ts     # Zod schemas + inferred DTO types
└── repositories/             # (some modules) split into multiple repos
```

The `stock` module extends this with additional sub-structure:

```
stock/
├── stock.service.ts
├── reservation.service.ts
├── repositories/
│   ├── stockBalance.repository.ts
│   └── stockLedger.repository.ts
└── utils/
    └── workflowResponsibility.ts
```

---

## 3. Request Flow

Every authenticated request passes through the same chain:

```
HTTP Request
    │
    ▼
CORS + JSON body parsing (express.json)
    │
    ▼
requestLoggerMiddleware     ← logs method, path, status, duration
    │
    ▼
authMiddleware              ← verifies Bearer JWT, attaches req.user
    │
    ▼
[adminMiddleware]           ← optional, enforced on /v1/admin/*
    │
    ▼
validateBody(zodSchema)     ← optional, on routes with a request body
    │
    ▼
Controller method
    │  extracts params, calls service, returns JSON
    ▼
Service method
    │  business rules, access checks, orchestration
    ▼
Repository method(s)
    │  Prisma queries
    ▼
Database (MySQL)
    │
    ▼
Response: { success: true, data: ... }
         { success: false, error: { code, message } }
    │
    ▼
[errorMiddleware]           ← catches any thrown error, formats response
```

### Route Mounting in `app.ts`

```
/health                         → public health check
/v1/auth/*                      → public (login, refresh)
/v1/admin/*                     → authMiddleware + adminMiddleware
  /categories, /vendors, /uoms
  /products, /product-registrations
  /locations, /users, /audit-logs
/v1/products                    → authMiddleware (read-only, all roles)
/v1/stock/*                     → authMiddleware
/v1/stock-adjustments/*         → authMiddleware
/v1/stock-transfers/*           → authMiddleware
/v1/saved-filters/*             → authMiddleware
/v1/dashboard/*                 → authMiddleware (applied per-route inside dashboard.routes.ts)
/v1/attachments/*               → authMiddleware
/v1/comments/*                  → authMiddleware
/v1/timeline/:entityType/:entityId          → authMiddleware (REST)
/v1/timeline/stream/:entityType/:entityId   → manual JWT check via ?token= (no authMiddleware;
                                              EventSource cannot send Authorization headers)
/v1/reports/*                   → authMiddleware
```

---

## 4. Validation Strategy

Request bodies are validated using **Zod schemas** before reaching the controller.

### `validateBody()` Middleware Factory

Defined in `src/utils/validation.ts`:

```typescript
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const messages = result.error.issues
        .map(e => `${e.path.join('.')}: ${e.message}`)
        .join('; ');
      return next(new ValidationError(messages));
    }
    req.body = result.data;  // body replaced with parsed + coerced data
    next();
  };
}
```

Schemas are defined in each module's `*.validator.ts` file and export inferred DTO types:

```typescript
// stockAdjustment.validator.ts
export const addItemSchema = z.object({
  productId:  z.string().uuid('productId must be a valid UUID'),
  locationId: z.string().uuid('locationId must be a valid UUID'),
  qtyChange:  z.number().refine(n => n !== 0, 'qtyChange cannot be zero'),
  reason:     z.string().optional(),
});

export type AddItemDto = z.infer<typeof addItemSchema>;
```

Routes that require a body attach `validateBody` before the controller:

```typescript
router.post('/:id/items', validateBody(addItemSchema), (req, res, next) =>
  stockAdjustmentController.addItem(cast(req), res, next)
);
```

Routes without a body (e.g. `POST /:id/submit`, `GET /`) have no body validator attached.

### Additional Validation Helpers

`src/utils/validationHelpers.ts` provides async helpers used inside service methods:

| Helper | Purpose |
|---|---|
| `validateLocationActive(locationId)` | Checks location exists and `isActive = true` |
| `validateProductActive(productId, locationId)` | Checks `ProductLocation.isActive = true` |
| `getProductLocationStatus(productId, locationId)` | Returns `{ isRegisteredNow, isActiveNow }` |
| `validateUserAccess(userId, locationId)` | Checks `UserLocationRole` row exists |

These return `{ valid: boolean, reason?: string }` and **never throw** — they are used for enrichment and warnings, with enforcement handled separately via guards.

---

## 5. Database Access Pattern

Prisma is used as the ORM. A single shared client instance is exported from `src/config/database.ts`:

```typescript
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development'
    ? ['query', 'info', 'warn', 'error']
    : ['error'],
});
export default prisma;
```

This singleton is imported directly by all repositories and any service that needs ad-hoc queries.

### Repository Pattern

Each module's repository encapsulates all Prisma queries for that domain. Repositories receive the Prisma client (or a transaction client) as a parameter where needed, enabling transaction composition.

Example pattern:

```typescript
// stockAdjustment.repository.ts
class StockAdjustmentRepository {
  async findById(id: string): Promise<AdjustmentRequestRow | null> {
    return prisma.stockAdjustmentRequest.findUnique({
      where: { id },
      include: { items: true, location: true, creator: true },
    });
  }

  async updateStatus(
    tx: Prisma.TransactionClient,
    id: string,
    status: AdjustmentRequestStatus,
  ): Promise<void> {
    await tx.stockAdjustmentRequest.update({ where: { id }, data: { status } });
  }
}
```

### Date Filtering

All list endpoints normalize date range inputs consistently via `src/utils/dateFilter.ts`:

- `startDate` → start of day (`00:00:00.000`)
- `endDate` → end of day (`23:59:59.999`)

This ensures single-day filters return complete results and prevents off-by-one issues from raw date string parsing.

---

## 6. Transaction Handling

All stock mutations that touch `StockBalance` or `StockLedger` run inside a `prisma.$transaction()` call. This guarantees atomicity and prevents partial state from being written on failure.

### Standard Transaction Pattern (Stock Finalization)

```typescript
await prisma.$transaction(async (tx) => {
  // 1. Acquire row-level lock on StockBalance
  const locked = await stockBalanceRepository.lockRow(tx, productId, locationId);

  // 2. Validate available stock (onHandQty - reservedQty)
  const available = Number(locked.onHandQty) - Number(locked.reservedQty);
  if (available + qtyChange < 0) {
    throw new ValidationError('Insufficient available stock');
  }

  // 3. Apply balance update
  const updated = await stockBalanceRepository.increment(tx, productId, locationId, qtyChange);

  // 4. Write immutable ledger entry
  await stockLedgerRepository.create(tx, {
    productId, locationId,
    changeQty: qtyChange,
    sourceType,  // ADJUSTMENT | TRANSFER_IN | TRANSFER_OUT
    sourceId,
    balanceAfter: updated.onHandQty,
  });

  // 5. Update request status
  await requestRepository.updateStatus(tx, requestId, 'FINALIZED');

  // 6. (Transfers only) Consume or release reservation
  await reservationService.consume(tx, reservationId);
});
```

The transaction client `tx` is passed through to repository methods rather than using the global `prisma` instance, so all operations within the block participate in the same transaction.

### When Transactions Are Used

| Operation | Transactional |
|---|---|
| Adjustment finalization | Yes |
| Transfer finalization | Yes |
| Reservation creation (approve-origin) | Yes |
| Reservation release (cancel/reject) | Yes |
| Status-only changes (submit, reject) | No |
| Read queries | No |

---

## 7. Authorization Model

### Authentication

`authMiddleware` reads the `Authorization: Bearer <token>` header, verifies the JWT using `authService.verifyAccessToken()`, and attaches the decoded payload to `req.user` as `AuthenticatedRequest`:

```typescript
interface AuthUser {
  id: string;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  isAdmin: boolean;
}
```

### Roles

There are two distinct role dimensions:

**System role (on `User`):**
- `isAdmin: true` — full access to all locations, all requests, and admin-only endpoints

**Location role (on `UserLocationRole`):**
- `MANAGER` — can approve/reject requests at their assigned locations
- `OPERATOR` — can create and finalize requests at their assigned locations

A user can have roles at multiple locations.

### Access Enforcement

**Route-level:** `adminMiddleware` blocks any non-admin from reaching `/v1/admin/*` routes.

**Service-level:** `assertUserCanAccessLocation()` in `src/utils/guards.ts` enforces location membership:

```typescript
export async function assertUserCanAccessLocation(
  userId: string,
  isAdmin: boolean,
  locationId: string,
): Promise<void> {
  if (isAdmin) return;                          // admins bypass all checks
  const role = await prisma.userLocationRole.findFirst({
    where: { userId, locationId },
  });
  if (!role) throw new ForbiddenError('You do not have access to this location');
}
```

**List filtering:** Non-admin users' list queries are automatically scoped to their assigned locations:

```typescript
// In service.findAll():
if (!user.isAdmin) {
  const roles = await prisma.userLocationRole.findMany({ where: { userId: user.id } });
  locationIds = roles.map(r => r.locationId);
}
```

**Workflow-level:** Approval actions (approve, reject) additionally check that the user holds a `MANAGER` role (or `isAdmin`) at the relevant location before the action is permitted.

---

## 8. Logging & Audit Strategy

### Request Logging

`requestLoggerMiddleware` logs every HTTP request on response completion:

- Fields: `method`, `url`, `statusCode`, `duration (ms)`, `ip`
- Log level: `info` for 2xx/3xx, `warn` for 4xx, `error` for 5xx

### Application Logging

Winston is used throughout the application (`src/utils/logger.ts`):

- **Development:** log level `debug`, colorized console output
- **Production:** log level `info`, JSON format

Services call `logger.info(...)` and `logger.error(...)` at meaningful operation boundaries (e.g. stock filter params, finalization start/end).

### Audit Log

`src/services/audit.service.ts` provides a shared `auditService.log()` function called from service methods after significant state changes.

**Logged actions:** `CREATE`, `UPDATE`, `DELETE`, `APPROVE`, `FINALIZE`, `CANCEL`, `STATUS_CHANGE`, `TRANSFER_CREATE`, `FINALIZE_BLOCKED`, `BLOCKED`, `USER_PASSWORD_RESET`, `RETIRE`, `SKU_RENAME`, `ATTACHMENT_UPLOAD`, `ATTACHMENT_DELETE`

**Logged entity types:** `PRODUCT`, `LOCATION`, `STOCK_ADJUSTMENT`, `STOCK_ADJUSTMENT_REQUEST`, `STOCK_TRANSFER`, `STOCK_TRANSFER_REQUEST`, `PRODUCT_LOCATION`, `USER`, `CATEGORY`, `VENDOR`, `UOM`, `ATTACHMENT`, `GOODS`

Each audit entry records:

| Field | Content |
|---|---|
| `userId` | Who performed the action |
| `action` | What action was taken |
| `entityType` | What kind of entity was affected |
| `entityId` | Which specific entity |
| `beforeSnapshot` | State before the change (JSON) |
| `afterSnapshot` | State after the change (JSON) |
| `warnings` | Non-blocking warnings at the time of action |

**Key design property:** `auditService.log()` wraps its Prisma write in a `try/catch` and swallows errors. Audit failures are logged to console but never propagate to the caller. This guarantees that a failed audit write cannot roll back or block the main operation.

Audit logs are readable via `GET /v1/admin/audit-logs` (admin only).
