# backend-folder-structure.md

## Purpose

This document defines the **backend architecture and folder structure** for the Asset Management System. It provides strict guidance for AI development tools so code is organized, maintainable, and safe for stock‑critical workflows.

The backend must follow **layered architecture** with clear separation of responsibilities:

- Controllers (HTTP layer)
- Services (business logic)
- Repositories / Prisma access
- Validation
- Middleware
- Utilities

AI must **never mix these layers**.

---

# Technology Stack

Recommended backend stack:

Node.js
TypeScript
Express.js
Prisma ORM
MySQL
Jest

---

# Backend Root Structure

```
backend

src
  app.ts
  server.ts

  config
  modules
  middleware
  services
  repositories
  validators
  utils
  types

prisma
  schema.prisma
  seed.ts
  seed/

  migrations

  tests

package.json
```

---

# Source Folder Structure

```
src

config/
modules/
middleware/
services/
repositories/
validators/
utils/
types/
```

---

# Config Folder

```
config/
  database.ts
  env.ts
  logger.ts
```

Responsibilities:

- environment configuration
- database connection
- application configuration

---

# Modules Folder

Modules group features by domain.

```
modules/

  auth/
  stock/
  adjustments/
  movements/
  admin/
  audit/
```

Each module contains:

```
module/

  controller.ts
  routes.ts
  service.ts
  validator.ts
```

Modules must not access the database directly. They must call **repositories**.

---

# Controllers

Controllers handle:

- HTTP requests
- authentication context
- calling services
- formatting responses

Controllers must **not contain business logic**.

Example responsibilities:

- read request body
- call service
- return JSON

---

# Services

Services contain **business logic and workflows**.

Examples:

- create stock adjustment request
- approve movement
- finalize movement

Services must:

- enforce workflow state transitions
- perform validations
- run database transactions

Stock‑critical logic must exist **only in services**.

---

# Repositories

Repositories are the **only layer allowed to interact with Prisma directly**.

```
repositories/

  product.repository.ts
  stock.repository.ts
  adjustment.repository.ts
  movement.repository.ts
  user.repository.ts
```

Responsibilities:

- database queries
- persistence operations

Repositories must not contain business logic.

---

# Validators

Validation layer ensures input correctness.

```
validators/

  adjustment.validator.ts
  movement.validator.ts
  product.validator.ts
```

Recommended libraries:

Zod
or
Joi

Validators must check:

- required fields
- quantity rules
- duplicate product rows
- request structure

---

# Middleware

Middleware handles cross‑cutting concerns.

```
middleware/

  auth.middleware.ts
  role.middleware.ts
  error.middleware.ts
  request-logger.middleware.ts
```

Responsibilities:

- authentication
- role enforcement
- centralized error handling

---

# Utils

Reusable helper functions.

```
utils/

  password.ts
  pagination.ts
  date.ts
  transaction.ts
```

Examples:

- password hashing
- pagination helpers
- transaction wrappers

---

# Types

Shared TypeScript types.

```
types/

  request.types.ts
  stock.types.ts
  auth.types.ts
```

Used to standardize service inputs and outputs.

---

# Prisma Folder

```
prisma/

  schema.prisma

  seed.ts

  seed/
    demo.seed.ts

  migrations/
```

Responsibilities:

- schema definition
- migrations
- seed scripts

---

# Tests Folder

```
tests/

  integration/

  adjustments.test.ts
  movements.test.ts
  reservation.test.ts
```

Integration tests must verify:

- stock integrity
- workflow enforcement
- reservation rules

---

# API Route Structure

Routes must be modular.

```
modules/

  adjustments/
    adjustments.routes.ts

  movements/
    movements.routes.ts

  stock/
    stock.routes.ts
```

Routes connect controllers to Express.

---

# Transaction Handling

Critical workflows must use database transactions.

Examples:

- stock reservation
- movement finalization
- stock adjustment

Transactions must be implemented inside **services**.

---

# Logging

Every workflow action should log:

- user ID
- location
- request ID
- action

Logs support the audit module.

---

# Error Handling

Use centralized error middleware.

Controllers should throw structured errors.

Example:

```
throw new ValidationError("Stock cannot go below zero")
```

---

# Dependency Flow Rules

Allowed dependency direction:

Controller -> Service -> Repository -> Database

Forbidden flows:

Controller -> Prisma
Controller -> Repository
Repository -> Service

These restrictions prevent architecture violations.

---

# AI Implementation Rules

AI tools generating backend code must follow these rules:

1. Controllers must be thin
2. Business logic belongs only in services
3. Repositories only access database
4. All stock logic must use transactions
5. Validators must check request payloads
6. Modules must be domain‑based

Violating these rules may break stock integrity or workflow safety.

---

# Success Criteria

A correctly structured backend should allow:

- safe workflow implementation
- clear module boundaries
- easy testing
- scalable feature additions

Future modules such as procurement, sales, or stock opname can be added without restructuring the system.

