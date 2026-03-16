# ui-page-map.md

## Purpose

This document defines every **UI page and navigation structure** for the Asset Management System. It serves as a blueprint for frontend development so AI tools can generate pages and navigation consistently without guessing.

Each page listed here should map to a **route, React page component, and menu entry** (if applicable).

---

# Navigation Overview

The application navigation is divided into the following groups:

1. Authentication
2. Dashboard
3. Stock
4. Requests
5. Admin
6. Audit Logs

Menu visibility depends on the **user's role and assigned locations**.

---

# 1. Authentication Pages

## Login

Route

```
/login
```

Purpose

Authenticate user using:

- email or phone
- password

On success:

Redirect to `/dashboard`.

---

# 2. Dashboard

## Dashboard Overview

Route

```
/dashboard
```

Displays:

- quick summary of stock
- pending adjustments
- pending movement approvals
- recent stock changes

Widgets:

- pending approvals count
- stock overview summary

---

# 3. Stock Module

## Stock Overview

Route

```
/stock
```

Displays stock table for selected period.

Columns:

- product
- starting qty
- inbound
- outbound
- pending inbound
- pending outbound
- final qty

Features:

- period filter
- product search
- pagination

Default behavior:

Users see **their location stock only** unless they belong to multiple locations.

Admins can select location filter.

---

# 4. Stock Adjustment Module

## Adjustment Request List

Route

```
/adjustments
```

Displays list of adjustment requests for user location.

Columns:

- request number
- status
- created by
- location
- created date

Actions:

- create adjustment
- view details
- cancel request

Managers can:

- approve requests

---

## Create Adjustment

Accessed via modal dialog from adjustment list.

Form fields:

- location
- item rows

Item rows:

- product
- quantity
- adjustment type (+ or -)

Rules:

- no duplicate products
- stock validation for negative adjustments

Actions:

- save draft
- submit request

---

## Adjustment Details

Shows request information.

Sections:

- request metadata
- item list
- approval status
- audit history

Actions:

- approve (manager)
- cancel
- finalize

---

# 5. Stock Movement Module

## Movement Request List

Route

```
/movements
```

Displays movement requests.

Columns:

- request number
- origin location
- destination location
- status
- created date

Actions:

- create movement
- view details
- cancel request

---

## Create Movement

Opened via modal dialog.

Form fields:

- origin location
- destination location
- item rows

Item rows:

- product
- quantity

Rules:

- origin and destination must differ
- no duplicate products
- stock availability validation

Actions:

- save draft
- submit request

---

## Movement Details

Shows request workflow.

Sections:

- request metadata
- item list
- origin approval
- destination approval
- audit history

Actions depend on role:

Origin Manager:

- approve origin request

Destination Operator:

- approve inbound

Operator or Manager:

- finalize movement

---

# 6. Admin Module

Admin pages manage master data.

## Products

Route

```
/admin/products
```

Features:

- list products
- create product
- edit product

Fields:

- product id
- product name
- category
- vendor
- unit

---

## Categories

Route

```
/admin/categories
```

Features:

- create category
- edit category

---

## Vendors

Route

```
/admin/vendors
```

Features:

- create vendor
- edit vendor

---

## Locations

Route

```
/admin/locations
```

Features:

- create location
- edit location

Fields:

- location code
- location name

---

## Users

Route

```
/admin/users
```

Features:

- create user
- edit user
- assign locations
- assign roles per location

---

# 7. Audit Logs

## Global Audit Logs

Route

```
/audit-logs
```

Displays all system changes.

Columns:

- timestamp
- user
- action
- entity
- entity id

Filters:

- date
- user
- entity type

---

## Request Audit Logs

Inside request details pages.

Displays history of:

- status changes
- approvals
- cancellations
- stock ledger creation

---

# Common UI Behaviors

## Confirmation Dialog

Required for:

- cancelling requests
- finalizing requests

Dialog example:

"Are you sure you want to cancel this request?"

---

## Success Notifications

Show snackbar messages for:

- request created
- request approved
- request finalized

---

## Error Handling

Errors should appear as:

- snackbar error notification
- inline form validation

---

# Future UI Expansion

Future modules can include:

- reporting dashboard
- inventory analytics
- stock forecasting

These pages should follow the same structure defined here.

---

# AI Implementation Rules

AI tools generating UI must:

1. Create one page component per route
2. Use shared layout components
3. Follow module grouping
4. Implement forms using Material UI
5. Use dialog-based creation flows

This ensures the UI remains consistent and scalable.

