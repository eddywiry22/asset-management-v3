# API Overview

A developer-oriented guide to the inventory management REST API — covering structure, auth, response contracts, filtering patterns, and module responsibilities.

---

## 1. API Structure

All endpoints are served under a versioned base path:

```
/api/v1/
```

Routes are organized by access level:

| Prefix | Access |
|---|---|
| `/api/v1/auth/*` | Public — no token required |
| `/api/v1/admin/*` | Admin only — requires valid JWT + `isAdmin: true` |
| All other routes | Authenticated users — requires valid JWT |

---

## 2. Authentication

The API uses **JWT Bearer tokens**. Every protected request must include the token in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

### Obtaining Tokens

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "identifier": "user@example.com",
  "password": "secret"
}
```

`identifier` accepts either an email address or a phone number.

**Response:**

```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "phone": null,
      "isActive": true,
      "isAdmin": false
    }
  }
}
```

### Token Lifetimes

| Token | Default TTL | Env var override |
|---|---|---|
| Access token | 15 minutes | `JWT_EXPIRES_IN` |
| Refresh token | 7 days | `JWT_REFRESH_EXPIRES_IN` |

### Role-Based Access

Non-admin users are further scoped to specific locations via `UserLocationRole`. Attempting to act on a location you are not assigned to returns `403 FORBIDDEN_ERROR`.

---

## 3. Standard Response Format

Every response follows a consistent envelope:

```json
{
  "success": true | false,
  "data": <resource or array>,
  "meta": { }
}
```

- `success` — always present; `true` on success, `false` on error
- `data` — the response payload; present on success responses
- `meta` — present on paginated list responses (see section 4)

### Status Codes

| Code | Meaning |
|---|---|
| `200` | Successful read or update |
| `201` | Resource created |
| `204` | Successful delete (no body) |
| `400` | Validation error |
| `401` | Missing or invalid token |
| `403` | Insufficient permissions |
| `404` | Resource not found |
| `500` | Internal server error |

---

## 4. Pagination

List endpoints accept `page` and `limit` as query parameters.

| Param | Type | Default | Constraints |
|---|---|---|---|
| `page` | integer | `1` | min: 1 |
| `limit` | integer | `20` | min: 1, max: 100 |

**Example:**

```
GET /api/v1/stock?page=2&limit=50
```

**Response shape for paginated lists:**

```json
{
  "success": true,
  "data": [ ... ],
  "meta": {
    "page": 2,
    "limit": 50,
    "total": 340
  }
}
```

`total` is the count of all records matching the current filters, regardless of page. Use it to calculate total pages: `Math.ceil(total / limit)`.

---

## 5. Filtering Patterns

### Single-Value Filter

Pass a single UUID or string value directly:

```
GET /api/v1/stock?locationId=<uuid>
```

### Multi-Value Filter (Arrays)

Many filters accept multiple values simultaneously. Pass the same parameter repeatedly — no brackets required:

```
GET /api/v1/stock?locationIds=<uuid-1>&locationIds=<uuid-2>&locationIds=<uuid-3>
```

The API normalizes both a single value and an array of values:

```
# These are equivalent:
GET /api/v1/stock?locationIds=<uuid-1>
GET /api/v1/stock?locationIds[]=<uuid-1>
```

**Supported multi-value filter parameters** (varies by endpoint):

| Parameter | Filters by |
|---|---|
| `productIds` | One or more product UUIDs |
| `locationIds` | One or more location UUIDs |
| `categoryIds` | One or more category UUIDs |
| `vendorIds` | One or more vendor UUIDs |

**Example — multiple filters combined:**

```
GET /api/v1/stock?locationIds=<uuid-a>&locationIds=<uuid-b>&categoryIds=<uuid-c>&page=1&limit=20
```

Results match records that belong to **any** of the listed location IDs **and** any of the listed category IDs.

> **Note:** Some endpoints that accept `productId` (singular) and `productIds` (plural) treat them as mutually exclusive. Passing both returns a `400 VALIDATION_ERROR`.

### Text Search

The products endpoint supports a free-text `search` parameter that matches against both name and SKU:

```
GET /api/v1/admin/products?search=widget&categoryIds=<uuid>
```

### Date Range Filter

Endpoints that expose historical data accept `startDate` and `endDate`:

| Param | Format | Behavior |
|---|---|---|
| `startDate` | `YYYY-MM-DD` | Inclusive, from start of day |
| `endDate` | `YYYY-MM-DD` | Inclusive, through end of day (23:59:59.999) |

```
GET /api/v1/stock?startDate=2024-01-01&endDate=2024-03-31&locationIds=<uuid>
```

---

## 6. Module Overview

### `auth`
Handles login and token operations. The only public module — no `Authorization` header required.

### `products`
Master product catalog. Supports full CRUD for admins. Regular users have read-only access. Products can be filtered by category, vendor, and free-text search.

### `product-registrations`
Controls which products are active at which locations. A product must be registered and active at a location before stock operations can reference it there.

### `stock`
Tracks current stock balances per product per location. Returns quantity snapshots alongside inbound/outbound movement totals. Supports filtering by location, product, category, and date range.

### `adjustments`
Workflow for correcting stock counts. Follows a multi-step lifecycle:

```
DRAFT → PENDING_APPROVAL → APPROVED → FINALIZED
```

Users submit adjustments; admins approve or reject. Finalization commits changes to stock.

### `movements`
Read-only ledger of all stock movements. Useful for auditing inbound and outbound transactions per product/location over time.

### `dashboard`
Aggregated summary views. Includes a personal action queue (`my-actions`) showing items pending your attention, and a configurable preview widget for high-level stock health.

### `saved-filters`
Lets users persist and reuse filter configurations per module. Filters are stored as JSON and scoped to the authenticated user.

---

## 7. Error Handling

All errors follow the same envelope as success responses, with `success: false` and an `error` object:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description of what went wrong"
  }
}
```

Error codes are derived from the error class name in `SCREAMING_SNAKE_CASE`.

### Common Error Codes

| Code | Status | When it occurs |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Request body or query params fail schema validation |
| `AUTH_ERROR` | 401 | Token missing, malformed, or expired |
| `FORBIDDEN_ERROR` | 403 | Valid token but insufficient permissions |
| `NOT_FOUND_ERROR` | 404 | Requested resource does not exist |
| `INTERNAL_SERVER_ERROR` | 500 | Unhandled exception |

### Validation Error Detail

Validation errors include a message listing all failing fields and their reasons, separated by semicolons:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "productIds: Invalid UUID; page: Number must be greater than or equal to 1"
  }
}
```

### Example: Unauthorized Request

```json
{
  "success": false,
  "error": {
    "code": "AUTH_ERROR",
    "message": "Missing or invalid authorization header"
  }
}
```

### Example: Resource Not Found

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND_ERROR",
    "message": "Product not found"
  }
}
```
