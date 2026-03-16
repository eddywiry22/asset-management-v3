# frontend-architecture.md

## Purpose

This document defines the **frontend architecture and UI standards** for the Asset Management System. It ensures AI development tools implement the React frontend in a consistent, scalable, and maintainable way.

The frontend must strictly follow this structure to avoid messy component organization and duplicated logic.

---

# Technology Stack

Frontend stack:

React TypeScript Material UI (MUI) React Router Axios React Query (recommended)

These technologies should be used consistently across the application.

---

# Root Project Structure

```
frontend

src
  app
  pages
  components
  layouts
  modules
  services
  hooks
  context
  utils
  types

public

package.json
```

---

# App Folder

```
src/app

App.tsx
router.tsx
providers.tsx
```

Responsibilities:

- global providers
- application routing
- theme configuration

---

# Layouts

Layouts define page structure.

```
layouts/

MainLayout.tsx
AuthLayout.tsx
```

MainLayout should contain:

- top navigation bar
- side navigation
- page container

---

# Pages

Pages represent **route-level screens**.

```
pages/

LoginPage
DashboardPage
StockOverviewPage
AdjustmentsPage
MovementsPage
ProductsPage
VendorsPage
CategoriesPage
LocationsPage
UsersPage
AuditLogsPage
```

Pages must remain **thin**.

Pages should:

- compose components
- call hooks
- render UI

Pages must not contain business logic.

---

# Modules

Modules group domain-specific UI components.

```
modules/

stock/
adjustments/
movements/
admin/
audit/
```

Example:

```
modules/movements

MovementTable.tsx
MovementForm.tsx
MovementDetails.tsx
```

---

# Components

Reusable UI components shared across modules.

```
components/

DataTable
PageHeader
ConfirmDialog
FormDialog
SnackbarProvider
LoadingOverlay
```

These components enforce UI consistency.

---

# Services (API Layer)

API communication must be centralized.

```
services/

apiClient.ts
stock.service.ts
adjustments.service.ts
movements.service.ts
admin.service.ts
```

Responsibilities:

- HTTP requests
- endpoint abstraction

Use Axios as the HTTP client.

---

# Hooks

Reusable logic must live in hooks.

```
hooks/

useAuth.ts
useStock.ts
useMovements.ts
useAdjustments.ts
usePagination.ts
```

Hooks should call services and return structured data to UI components.

---

# Context

Global application state.

```
context/

AuthContext.tsx
NotificationContext.tsx
```

Responsibilities:

- authentication state
- global notifications

---

# Utils

Utility functions.

```
utils/

date.ts
format.ts
number.ts
```

Examples:

- date formatting
- number formatting

---

# Types

Shared TypeScript types.

```
types/

api.types.ts
stock.types.ts
movement.types.ts
adjustment.types.ts
```

Types must match the backend API contract.

---

# Routing

Use React Router.

Example routes:

```
/login
/dashboard
/stock
/adjustments
/movements
/admin/products
/admin/vendors
/admin/categories
/admin/locations
/admin/users
/audit-logs
```

Routes must enforce role-based access.

---

# Role-Based UI

Menus and pages should adapt to the user's roles.

Example rules:

Operator:

- stock overview
- adjustments
- movements

Manager:

- approval actions

Admin:

- master data management

Navigation menu should dynamically hide unauthorized sections.

---

# Table Standards

Most pages display tables.

Use a shared `DataTable` component.

Features:

- pagination
- sorting
- loading state
- empty state

Tables must support server-side pagination.

---

# Form Standards

Forms should use:

Material UI components React Hook Form (recommended)

Validation should follow backend rules.

Common form fields:

- product selector
- quantity input
- location selector

---

# Modal and Dialog Rules

Use Material UI `Dialog` for:

- create requests
- edit forms
- confirmation dialogs

Reusable dialogs should include:

ConfirmDialog FormDialog

Examples:

Create Movement Create Adjustment Cancel Request Confirmation

---

# Notification System

User feedback must follow consistent patterns.

Success messages:

Material UI Snackbar

Example messages:

"Movement request created successfully" "Adjustment finalized"

Error messages:

Snackbar with error severity

Validation errors:

Inline form errors using TextField helperText.

---

# Loading States

Loading indicators must appear during API calls.

Recommended components:

- CircularProgress
- LoadingOverlay

---

# API Error Handling

All API errors should be processed centrally.

Example:

```
apiClient.interceptors.response
```

Errors should trigger snackbar notifications.

---

# State Management

Use React Query for:

- server state
- caching
- background refetch

Avoid storing server state in global context.

---

# File Naming Convention

Use consistent naming:

```
ComponentName.tsx
hookName.ts
serviceName.service.ts
```

Example:

MovementForm.tsx useMovements.ts movements.service.ts

---

# AI Implementation Rules

AI tools generating frontend code must:

1. Keep pages thin
2. Move API logic to services
3. Move reusable logic to hooks
4. Use shared UI components
5. Follow Material UI design system
6. Use centralized notification system

---

# Success Criteria

A correctly implemented frontend should provide:

- consistent UI
- predictable navigation
- reliable API interaction
- scalable component architecture

Future modules can be added without restructuring the project.

