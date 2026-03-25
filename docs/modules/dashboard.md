# Dashboard Module

## 1. Purpose

The Dashboard is the entry point of the application. Its primary function is to surface **actions that require the current user's attention** — requests that are blocked waiting specifically on them, based on their role and location assignments.

The dashboard does not show the entire system state. It is a personalized, role-scoped view. Two users at different locations with different roles will see entirely different data from the same endpoints.

---

## 2. My Actions Concept

"My Actions" are requests that are sitting in a status where the current user is the appropriate next actor. The calculation is driven by three inputs:

1. **The user's assigned locations** — derived from `UserLocationRole` entries.
2. **The user's role at each location** — MANAGER or OPERATOR.
3. **The document's current status** and which location it references.

A request appears in "My Actions" only when it is waiting for something the user can actually do. Requests that are waiting for someone else, or that are already past the point of action, do not appear.

### Adjustments — What Counts as "Requiring Action"

| Role | Status | Condition | Meaning |
|------|--------|-----------|---------|
| MANAGER | `SUBMITTED` | Item location is in user's managed locations | Waiting for manager approval |
| OPERATOR | `APPROVED` | Item location is in user's operator locations | Waiting for finalization |

### Transfers — What Counts as "Requiring Action"

| Role | Status | Condition | Meaning |
|------|--------|-----------|---------|
| MANAGER | `SUBMITTED` | Source location is in user's managed locations | Waiting for origin approval |
| OPERATOR | `ORIGIN_MANAGER_APPROVED` | Destination location is in user's operator locations | Waiting for destination approval |
| OPERATOR | `READY_TO_FINALIZE` | Destination location is in user's operator locations | Waiting for finalization |

A user who holds both MANAGER and OPERATOR roles (possibly at different locations) will see items from both sets combined.

---

## 3. Metrics Explained

### Summary Metrics

| Metric | Calculation |
|--------|-------------|
| `pendingActions` | Sum of all role-scoped requiring-action counts across adjustments and transfers |
| `incomingTransfers` | Transfers in `ORIGIN_MANAGER_APPROVED`, `DESTINATION_OPERATOR_APPROVED`, or `READY_TO_FINALIZE` where the destination is one of the user's locations |

### Adjustment Metrics

| Metric | Who Sees a Non-Zero Value | Condition |
|--------|--------------------------|-----------|
| `needsApproval` | Users with MANAGER role | `SUBMITTED` adjustments touching their managed locations |
| `readyToFinalize` | Users with OPERATOR role | `APPROVED` adjustments touching their operator locations |
| `inProgress` | All users | `SUBMITTED` or `APPROVED` adjustments at any of the user's locations |

### Transfer Metrics

| Metric | Who Sees a Non-Zero Value | Condition |
|--------|--------------------------|-----------|
| `needsOriginApproval` | Users with MANAGER role at source | `SUBMITTED` transfers where source is a managed location |
| `needsDestinationApproval` | Users with OPERATOR role at destination | `ORIGIN_MANAGER_APPROVED` transfers where destination is an operator location |
| `incoming` | All users at destination | Transfers in any in-transit status heading to the user's locations |
| `readyToFinalize` | Users with OPERATOR role at destination | `READY_TO_FINALIZE` transfers where destination is an operator location |

### Admin Behavior

Admin users receive all-zero metrics across every field. Because admins are not assigned to specific locations via `UserLocationRole`, there are no location-scoped actions to surface. The response shape is identical but all counts are `0`.

---

## 4. Preview Table Behavior

Clicking a metric card opens a preview table — a short, filtered list of the requests behind that number.

### Preview Filters

Each metric card maps to a named filter:

| Card / Filter | Adjustments Query | Transfers Query |
|---------------|-------------------|-----------------|
| `REQUIRING_ACTION` | `SUBMITTED` at manager locations | `SUBMITTED` at manager origin **OR** `ORIGIN_MANAGER_APPROVED` at operator destination |
| `IN_PROGRESS` | `SUBMITTED` or `APPROVED` at any user location | `SUBMITTED`, `ORIGIN_MANAGER_APPROVED`, or `DESTINATION_OPERATOR_APPROVED` at source or destination |
| `READY_TO_FINALIZE` | `APPROVED` at operator locations | `READY_TO_FINALIZE` at operator destination locations |
| `ARRIVING` | N/A | `ORIGIN_MANAGER_APPROVED` at any user destination location |

### Rows and Ordering

- Default row count: **5 rows**. Configurable via `limit` parameter (min 1, max 10).
- Ordered by `createdAt DESC` — most recently created requests appear first.

### Columns Returned

**Adjustments:**

| Column | Source |
|--------|--------|
| Request number | `requestNumber` |
| Status | `status` |
| Created at | `createdAt` |
| Created by | `createdBy.username` |
| Location | First item's `location.code` and `location.name` |

Only the first item's location is shown. An adjustment can span multiple locations, but the preview shows a single representative location.

**Transfers:**

| Column | Source |
|--------|--------|
| Request number | `requestNumber` |
| Status | `status` |
| Created at | `createdAt` |
| Created by | `createdBy.username` |
| Origin | `sourceLocation.code` and `sourceLocation.name` |
| Destination | `destinationLocation.code` and `destinationLocation.name` |

---

## 5. Navigation Behavior

### From a Metric Card

Clicking a metric card opens the preview table filtered to that card's scope. The preview table is inline — it does not navigate away from the dashboard.

### From a Preview Row

Clicking any row in the preview table navigates directly to the detail page for that request:

- Adjustment row → `/stock-adjustments/{id}`
- Transfer row → `/stock-transfers/{id}`

### "View All" Link

Each preview table includes a "View All" link that navigates to the full list page with no pre-applied filter:

- Adjustments preview → `/stock-adjustments`
- Transfers preview → `/stock-transfers`

---

## 6. Key Rules

- **My Actions is role- and location-scoped.** The same request will appear in one user's actions and not another's based purely on role assignments. There is no global "inbox" — every user's view is derived independently.
- **A user must have `UserLocationRole` entries to see any data.** If a user has no location assignments, all metrics return `0` and preview tables return empty results. This applies even if the user is authenticated.
- **Admin users see no actions.** Admins are not assigned to locations, so the system has no basis for scoping actions to them. All metrics are `0` for admins. The dashboard is not the right interface for admins to monitor system-wide activity.
- **MANAGER and OPERATOR metrics are additive.** A user holding both roles (at different or the same locations) sees the union of what each role would show individually.
- **`inProgress` and `incoming` are visibility metrics, not action metrics.** They show what is happening near the user's locations without implying the user needs to act. They are present for situational awareness.
- **`pendingActions` is a rollup.** It sums only the action-required counts (`needsApproval`, `readyToFinalize` for adjustments; `needsOriginApproval`, `needsDestinationApproval`, `readyToFinalize` for transfers). It does not include `inProgress` or `incoming`.
- **Preview row count is capped at 10.** The preview is a sample, not a paginated list. For the full result set, users follow the "View All" link to the dedicated list page.
- **Location names in the preview are resolved at query time.** They reflect the current name of the location, not the name at the time the request was created.
