# Permission Matrix

This document defines the complete authorization model for the inventory system. Every permission decision in the system traces back to the rules described here. There is no implicit or "common-sense" access — a user either meets the exact conditions below or their request is rejected.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Role Definitions](#2-role-definitions)
3. [Permission Matrix](#3-permission-matrix)
4. [Location-Based Access Rules](#4-location-based-access-rules)
5. [Special Cases](#5-special-cases)
6. [Examples](#6-examples)

---

## 1. Overview

The system uses a **two-tier authorization model**:

**Tier 1 — Global Admin Flag**

The `User.isAdmin` boolean field determines whether a user has administrative access. Admin is not a location-scoped role — it applies globally and bypasses all location-level permission checks.

**Tier 2 — Location-Scoped Roles**

Non-admin users operate through `UserLocationRole` records. Each record assigns a user exactly one role at one location. A user can hold different roles at different locations (e.g., MANAGER at Location A, OPERATOR at Location B), but only one role per location.

```
UserLocationRole
  userId     → User
  locationId → Location
  role       → OPERATOR | MANAGER
  UNIQUE(userId, locationId)
```

**There is no "ADMIN" value in the `Role` enum.** The enum contains only `OPERATOR` and `MANAGER`. Administrative access is determined exclusively by `User.isAdmin = true`.

---

## 2. Role Definitions

### OPERATOR

An Operator is a staff member assigned to one or more specific locations. They perform day-to-day stock operations but have no authority to authorize changes.

**What an Operator can do:**
- View stock at locations they are assigned to
- Create and submit stock adjustment requests
- Create and submit stock transfer requests
- Finalize approved adjustment requests at their assigned locations
- Approve an incoming transfer at the destination (accept delivery)
- Finalize transfers at their assigned destination location
- Cancel a request they personally created, or cancel a transfer they are a participant in

**What an Operator cannot do:**
- Approve or reject adjustment requests
- Approve the origin step of a transfer (MANAGER required)
- Reject a transfer at the submission stage
- Access admin routes or manage master data, locations, or users

---

### MANAGER

A Manager has all Operator capabilities plus authorization authority over the locations they are assigned to.

**What a Manager can do (in addition to Operator):**
- Approve and reject adjustment requests at locations they are assigned to
- Approve the origin step of a transfer (must be assigned to the **source** location)
- Reject a transfer at the submission stage (must be assigned to the **source** location)
- Cancel adjustment requests at locations they are assigned to (even if they are not the creator)

**What a Manager cannot do:**
- Operate on locations they are not assigned to
- Access admin routes or manage master data, locations, or users
- Override system-level hard blocks (inactive locations, missing product registrations)

---

### Admin (isAdmin flag)

Admin is a system-level designation, not a location-scoped role. An admin user bypasses all location-access checks and can perform any workflow action at any location.

**What an Admin can do:**
- Everything a Manager can do, at any location without needing a UserLocationRole entry
- Access all routes under `/v1/admin/*`
- Create, update, deactivate, and reset passwords for non-admin users
- Manage locations, products, categories, vendors, UOMs, and product registrations
- View audit logs

**What an Admin cannot do — hard API blocks:**
- Admin users **cannot** be updated via the user management API
- Admin users **cannot** have their password reset via the API
- Admin users **cannot** be deactivated or reactivated via the API
- Admin users **cannot** be created via the API

Admin accounts are provisioned directly in the database. Once created, they are immutable through the application layer.

---

## 3. Permission Matrix

### 3.1 Admin Module Actions

All routes under `/v1/admin/*` require `isAdmin = true`. Location-scoped roles (OPERATOR, MANAGER) have no access.

| Action | OPERATOR | MANAGER | Admin |
|--------|:--------:|:-------:|:-----:|
| View categories | ✗ | ✗ | ✓ |
| Create / update / delete categories | ✗ | ✗ | ✓ |
| View vendors | ✗ | ✗ | ✓ |
| Create / update / delete vendors | ✗ | ✗ | ✓ |
| View units of measure | ✗ | ✗ | ✓ |
| Create / update / delete units of measure | ✗ | ✗ | ✓ |
| View products | ✗ | ✗ | ✓ |
| Create / update products | ✗ | ✗ | ✓ |
| Manage product registrations (per location) | ✗ | ✗ | ✓ |
| View locations | ✗ | ✗ | ✓ |
| Create / update locations | ✗ | ✗ | ✓ |
| View all users | ✗ | ✗ | ✓ |
| Create non-admin user | ✗ | ✗ | ✓ |
| Update non-admin user | ✗ | ✗ | ✓ |
| Deactivate / reactivate non-admin user | ✗ | ✗ | ✓ |
| Reset non-admin user password | ✗ | ✗ | ✓ |
| View audit logs | ✗ | ✗ | ✓ |

---

### 3.2 Stock Viewing

Non-admin users see only locations they are assigned to. Admin sees all locations.

| Action | OPERATOR | MANAGER | Admin | Scope |
|--------|:--------:|:-------:|:-----:|-------|
| View stock overview | Assigned locations only | Assigned locations only | All locations | Location-filtered |
| View stock detail for a location | If assigned to that location | If assigned to that location | Any location | Location-filtered |
| View stock history / ledger | If assigned to that location | If assigned to that location | Any location | Location-filtered |

---

### 3.3 Stock Adjustment Lifecycle

An adjustment request moves through the states: `DRAFT → SUBMITTED → APPROVED → FINALIZED`
with terminal states `REJECTED` and `CANCELLED` reachable from multiple points.

| Action | OPERATOR | MANAGER | Admin | Required Condition |
|--------|:--------:|:-------:|:-----:|--------------------|
| Create adjustment (DRAFT) | ✓ | ✓ | ✓ | Must have access to the item location(s) |
| Submit adjustment (DRAFT → SUBMITTED) | Creator only | Creator only | ✓ | User is the creator |
| Approve adjustment (SUBMITTED → APPROVED) | ✗ | ✓ | ✓ | MANAGER: must be assigned to at least one item location |
| Reject adjustment (SUBMITTED → REJECTED) | ✗ | ✓ | ✓ | MANAGER: must be assigned to at least one item location |
| Finalize adjustment (APPROVED → FINALIZED) | ✓ | ✓ | ✓ | Must be assigned to item location(s); at least one eligible active user must exist at each item location |
| Cancel adjustment (any non-terminal state) | Creator only | Creator OR assigned to item location | ✓ | See notes |
| Delete adjustment (DRAFT only) | Creator only | Creator only | ✓ | Request must be in DRAFT |

**Cancel notes:**
- An OPERATOR can cancel only if they are the creator.
- A MANAGER can cancel if they are the creator **or** if they hold a MANAGER role at any of the item locations, regardless of who created the request.
- An Admin can cancel any adjustment at any time.

---

### 3.4 Stock Transfer Lifecycle

A transfer request moves through: `DRAFT → SUBMITTED → ORIGIN_MANAGER_APPROVED → DESTINATION_OPERATOR_APPROVED (READY_TO_FINALIZE) → FINALIZED`
with terminal states `REJECTED` and `CANCELLED`.

Each approval step is tied to a specific location role.

| Action | OPERATOR | MANAGER | Admin | Required Condition |
|--------|:--------:|:-------:|:-----:|--------------------|
| Create transfer (DRAFT) | ✓ | ✓ | ✓ | Must be assigned to the source location |
| Submit transfer (DRAFT → SUBMITTED) | Creator only | Creator only | ✓ | User is the creator |
| Approve origin (SUBMITTED → ORIGIN_MANAGER_APPROVED) | ✗ | ✓ at **source** | ✓ | MANAGER: must hold MANAGER role specifically at the source location |
| Approve destination (ORIGIN_MANAGER_APPROVED → READY_TO_FINALIZE) | ✓ at **dest** | ✓ at **dest** | ✓ | Any role (OPERATOR or MANAGER) at the destination location |
| Finalize transfer (READY_TO_FINALIZE → FINALIZED) | ✓ at **dest** | ✓ at **dest** | ✓ | Must be assigned to destination; at least one eligible active user must exist at the destination |
| Reject from SUBMITTED | ✗ | ✓ at **source** | ✓ | MANAGER at source location |
| Reject from ORIGIN_MANAGER_APPROVED | ✓ at **dest** | ✓ at **dest** | ✓ | Any role at the destination location |
| Cancel transfer (any non-terminal state) | Creator OR participant | Creator OR participant | ✓ | See notes |
| Delete transfer (DRAFT only) | Creator only | Creator only | ✓ | Request must be in DRAFT |

**Approve origin note:** An OPERATOR at the source location cannot approve origin. Only a MANAGER (or Admin) at the source location can do so.

**Cancel notes:**
- A user can cancel if they are the creator.
- A user can also cancel if they hold any role (OPERATOR or MANAGER) at either the source **or** the destination location — regardless of whether they are the creator.
- An Admin can cancel any transfer at any time.

---

## 4. Location-Based Access Rules

### 4.1 Assignment Requirement

Every non-admin action that involves a specific location requires a `UserLocationRole` record linking that user to that location. The system does not infer access from any other attribute (department, team, manager hierarchy, etc.). If the row does not exist, access is denied.

```
assertUserCanAccessLocation(userId, isAdmin, locationId):
  if isAdmin → allow (no database check performed)
  if UserLocationRole(userId, locationId) exists → allow
  else → ForbiddenError
```

### 4.2 One Role Per Location

A user holds exactly one role at each location. The `@@unique([userId, locationId])` constraint on `UserLocationRole` enforces this. A user cannot be both OPERATOR and MANAGER at the same location.

### 4.3 Roles Are Independent Per Location

A user's role at one location has no bearing on another location. Examples:

- User A is a MANAGER at Warehouse 1 and an OPERATOR at Warehouse 2. They can approve adjustments at Warehouse 1 but not at Warehouse 2.
- User B is an OPERATOR at Warehouse 3. They are not visible to Warehouse 3 as a potential approver.
- User C has no `UserLocationRole` entries. They cannot access any location-scoped feature.

### 4.4 List Queries Are Automatically Filtered

When a non-admin user queries stock, adjustments, or transfers, the results are automatically restricted to locations they are assigned to. The user cannot opt-in to seeing data from locations they are not assigned to by passing location IDs they do not have access to — the system validates each requested location ID against the user's roles and throws `ForbiddenError` if any are unauthorized.

Admin users see data across all locations by default. If an admin provides explicit location filter parameters, only those locations are returned.

### 4.5 Workflow Steps Are Location-Specific

For transfers, the source-location and destination-location checks are distinct:

- **Approve origin** checks the user's role at the **source** location.
- **Approve destination** checks the user's role at the **destination** location.
- A MANAGER at the source cannot approve at the destination (unless they also have a role at the destination).

### 4.6 Inactive Locations Block Operations

If a location is set to inactive by an Admin, the following operations are hard-blocked regardless of the user's role:

| Operation | Block condition |
|-----------|----------------|
| Create/submit adjustment | Any item location is inactive |
| Approve/finalize adjustment | Any item location is inactive |
| Create/submit transfer | Source or destination is inactive |
| Approve origin on transfer | Source location is inactive |
| Approve destination / finalize transfer | Destination location is inactive |

These blocks apply to all roles, including Admin. An Admin must reactivate a location before operations can resume.

---

## 5. Special Cases

### 5.1 Admin Limitations (Hard API Blocks)

Admin users are provisioned directly in the database and are protected from modification through the application API. The following operations on Admin users are explicitly blocked regardless of who is calling:

| API Action | Blocked? | Error |
|-----------|:--------:|-------|
| `PUT /users/:id` (if target is admin) | **Yes** | `ForbiddenError: Cannot update admin users via API` |
| `POST /users/:id/toggle-active` (if target is admin) | **Yes** | `ForbiddenError: Cannot toggle admin user status via API` |
| `POST /users/:id/reset-password` (if target is admin) | **Yes** | `ForbiddenError: Cannot reset admin user password via API` |
| Create a user with `isAdmin: true` via API | **Yes** | Rejected at schema validation |

Admin accounts must be managed directly in the database.

### 5.2 Workflow Deadlock Prevention (Stage 8.6)

The system blocks two operations that would create an irreversible workflow deadlock:

**Block 1 — Finalize without eligible users**

Before finalization is allowed, the system checks that at least one active, eligible user exists to handle the current workflow step. If none exist, finalization is blocked.

| Workflow | Step | Eligible users |
|----------|------|----------------|
| Adjustment | APPROVED → FINALIZED | Active OPERATOR or MANAGER at all item locations |
| Transfer | READY_TO_FINALIZE → FINALIZED | Active OPERATOR or MANAGER at destination location |

If the check finds zero eligible users, the operation fails with:
`ValidationError: Cannot finalize — no eligible users exist at the required location(s)`

**Block 2 — Deactivate a user who is the sole eligible participant**

Before deactivating a user, the system checks every active adjustment and transfer. If the user is the only eligible actor for any current workflow step, deactivation is blocked:

`AppError(400): User is required to complete ongoing adjustment/transfer workflows`

The user can be deactivated once the blocking workflows are resolved (finalized, rejected, or cancelled) or once another eligible user is assigned to those locations.

### 5.3 Product Registration Required

For stock adjustments and transfers to proceed, each product must be actively registered at the relevant location (`ProductLocation.isActive = true`). A product that is registered but marked inactive at a location is treated identically to a product with no registration. The system blocks creating or approving requests for unregistered or inactive products at the relevant locations.

### 5.4 Creator vs. Role-Based Cancel

Cancellation checks follow a specific precedence:

For **adjustments**:
1. If the user is the creator → allow (any role).
2. If the user holds MANAGER at any item location → allow.
3. Otherwise → `ForbiddenError`.

For **transfers**:
1. If the user is the creator → allow (any role).
2. If the user holds any role (OPERATOR or MANAGER) at the source **or** destination location → allow.
3. Otherwise → `ForbiddenError`.

Note: An OPERATOR who did not create the transfer but is assigned to the source or destination location can cancel it. This is intentional — any participant can abort a transfer they are involved in.

### 5.5 Reject Is Status-Dependent

Rejection authority for transfers changes depending on the current status:

| Current status | Who can reject | Location check |
|---------------|---------------|----------------|
| `SUBMITTED` | MANAGER or Admin | MANAGER must be at **source** |
| `ORIGIN_MANAGER_APPROVED` | Any role or Admin | User must be at **destination** |

An OPERATOR at the destination can reject a transfer that has already been approved at origin (to refuse the incoming delivery). An OPERATOR at the source cannot reject at the submission stage.

---

## 6. Examples

### Example 1 — Standard Operator Workflow

**Setup:** User Alice is an OPERATOR at Warehouse A.

| Action | Allowed? | Reason |
|--------|:--------:|--------|
| View stock at Warehouse A | ✓ | Assigned to Warehouse A |
| View stock at Warehouse B | ✗ | No UserLocationRole for Warehouse B |
| Create adjustment request for Warehouse A items | ✓ | Assigned to Warehouse A |
| Submit the adjustment she created | ✓ | She is the creator |
| Approve the adjustment after it is submitted | ✗ | OPERATOR cannot approve; MANAGER required |
| Finalize the adjustment after a Manager approves it | ✓ | OPERATOR at item location can finalize |
| Create a transfer from Warehouse A to Warehouse B | ✓ | Assigned to source (Warehouse A) |
| Approve origin on the transfer she created | ✗ | OPERATOR cannot approve origin; MANAGER required |

---

### Example 2 — Manager Approving Across Assigned Locations

**Setup:** User Bob is a MANAGER at Warehouse A and an OPERATOR at Warehouse B.

| Action | Allowed? | Reason |
|--------|:--------:|--------|
| Approve an adjustment for items at Warehouse A | ✓ | MANAGER at item location (Warehouse A) |
| Approve an adjustment for items at Warehouse B | ✗ | Only an OPERATOR at Warehouse B; MANAGER required for approval |
| Approve origin on a transfer from Warehouse A | ✓ | MANAGER at source location |
| Approve origin on a transfer from Warehouse B | ✗ | Not a MANAGER at Warehouse B |
| Approve destination on a transfer arriving at Warehouse B | ✓ | Any role at destination is sufficient |
| Cancel an adjustment he did not create, for Warehouse A items | ✓ | MANAGER at item location can cancel regardless of creator |
| Cancel an adjustment he did not create, for Warehouse B items | ✗ | Only OPERATOR at Warehouse B; cannot cancel others' requests |

---

### Example 3 — Admin Acting Without Location Assignment

**Setup:** User Carol has `isAdmin = true` and zero `UserLocationRole` entries.

| Action | Allowed? | Reason |
|--------|:--------:|--------|
| View stock at any location | ✓ | Admin bypasses location checks |
| Approve an adjustment at any location | ✓ | Admin bypasses location checks |
| Approve origin on a transfer from any location | ✓ | Admin bypasses location checks |
| Access `/v1/admin/users` | ✓ | Admin flag grants access to admin routes |
| Update her own user account via `/v1/admin/users/:id` | ✗ | Target is an Admin; API blocks modification of Admin users |
| Reset her own password via the API | ✗ | Target is an Admin; blocked |

---

### Example 4 — Transfer With Different Roles at Source and Destination

**Setup:**
- Warehouse A: Dave is MANAGER, Eve is OPERATOR
- Warehouse B: Frank is OPERATOR, Grace is MANAGER

A transfer is created from Warehouse A to Warehouse B.

| Step | Who can act | Why |
|------|------------|-----|
| Submit | Creator only (any role) | Submitter must be creator |
| Approve origin | Dave (MANAGER at source) | MANAGER at source location required |
| Approve destination | Frank or Grace (any role at destination) | Any role at destination |
| Finalize | Frank or Grace (any role at destination) | Any role at destination; at least one must be active |
| Reject (from SUBMITTED) | Dave only | MANAGER at source |
| Reject (from ORIGIN_MANAGER_APPROVED) | Frank or Grace | Any role at destination |
| Cancel | Creator, Dave, Eve, Frank, or Grace | Any participant at source or destination can cancel |

---

### Example 5 — Stage 8.6 Deadlock Block in Practice

**Setup:** Warehouse C has one assigned user: Henry (OPERATOR). An adjustment at Warehouse C is in `APPROVED` status waiting to be finalized.

| Action | Allowed? | Reason |
|--------|:--------:|--------|
| Deactivate Henry | ✗ | Henry is the only eligible finalizer for the active adjustment at Warehouse C |
| Finalize the adjustment (Henry acting) | ✓ | Henry is an OPERATOR at item location |
| Deactivate Henry after finalization | ✓ | No longer the sole blocker; no active workflows depend on him |

**Setup variant:** Admin deactivates Henry before the adjustment is resolved, then tries to finalize.
- `finalize()` checks for eligible active users → finds zero (Henry is inactive) → throws `ValidationError`.
- Admin would need to reactivate Henry, assign another user to Warehouse C, or cancel the adjustment to unblock.
