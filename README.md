# Asset Management System

An internal inventory management system for tracking products, stock levels, adjustments, and movements across multiple warehouse locations.

## Tech Stack

| Layer    | Technology                                     |
|----------|------------------------------------------------|
| Backend  | Node.js, Express.js, TypeScript, Prisma ORM    |
| Frontend | React, TypeScript, Vite, Material UI           |
| Database | MySQL 8.0                                      |
| Runtime  | Docker, Docker Compose                         |

---

## Getting Started

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/) installed.

### 1. Start all services

```bash
docker compose up --build
```

This starts:
- **MySQL** on port `3306`
- **Backend** on port `3000`
- **Frontend** on port `5173`

Migration runs automatically on backend startup. To seed demo data:

```bash
docker compose exec backend npm run prisma:seed
```

---

## Health Check

Verify the backend is running:

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{ "status": "OK", "timestamp": "..." }
```

Frontend is accessible at: [http://localhost:5173](http://localhost:5173)

---

## Test Credentials

All accounts use password: **`password123`**

### Admin

| Email | Password | Notes |
|---|---|---|
| `admin@example.com` | `password123` | Global admin (no location role) |

### Managers

| Email | Password | Location |
|---|---|---|
| `manager1@example.com` | `password123` | MANAGER at WH-001 |
| `manager2@example.com` | `password123` | MANAGER at WH-002 |
| `manager3@example.com` | `password123` | MANAGER at WH-003 |

### Operators

| Email | Password | Location |
|---|---|---|
| `operator1@example.com` | `password123` | OPERATOR at WH-001 |
| `operator2@example.com` | `password123` | OPERATOR at WH-002 |
| `operator3@example.com` | `password123` | OPERATOR at WH-003 |

### Demo Locations

| Code | Name |
|---|---|
| WH-001 | Main Warehouse (Jakarta) |
| WH-002 | Secondary Warehouse (Surabaya) |
| WH-003 | Northern Warehouse (Medan) |

---

## NPM Scripts

### Backend (`/backend`)

| Script             | Description                          |
|--------------------|--------------------------------------|
| `npm run dev`      | Start development server (ts-node-dev) |
| `npm run build`    | Compile TypeScript to `/dist`        |
| `npm start`        | Run compiled server                  |
| `npm run prisma:migrate` | Run Prisma migrations          |
| `npm run prisma:generate` | Regenerate Prisma client      |
| `npm run prisma:seed` | Execute seed script               |
| `npm test`         | Run Jest tests                       |

### Frontend (`/frontend`)

| Script          | Description                       |
|-----------------|-----------------------------------|
| `npm run dev`   | Start Vite dev server             |
| `npm run build` | Build for production              |
| `npm run preview` | Preview production build        |

---

## Project Structure

```
/asset-management-v3
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma       # Prisma schema (source of truth)
│   │   ├── seed.ts             # Seed script (idempotent)
│   │   └── migrations/         # Applied migrations
│   ├── src/
│   │   ├── app.ts              # Express app setup
│   │   ├── server.ts           # Server entry point
│   │   ├── config/             # env, database config
│   │   ├── middlewares/        # auth, error, request-logger middleware
│   │   ├── modules/            # Feature modules (auth, users, locations, ...)
│   │   │   ├── auth/           # controller, service, routes, validator
│   │   │   ├── users/          # service, repository
│   │   │   └── locations/      # service, repository
│   │   ├── types/              # Shared TypeScript types
│   │   └── utils/              # logger, errors, validation helpers
│   ├── tests/                  # Jest tests
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── main.tsx            # React entry point
│   │   ├── App.tsx             # Root app with providers
│   │   ├── api/client.ts       # Axios API client (auto-logout on 401)
│   │   ├── context/            # AuthContext
│   │   ├── routes/router.tsx   # React Router config with ProtectedRoute
│   │   ├── theme/theme.ts      # MUI theme
│   │   ├── components/layout/  # AppLayout, Sidebar, Topbar, ProtectedRoute
│   │   ├── modules/auth/       # LoginPage
│   │   └── services/           # auth.service.ts
│   ├── Dockerfile
│   └── package.json
├── doc/                        # Project documentation
├── docker-compose.yml
└── README.md
```

---

## Running Migrations and Seed (Local Development)

```bash
cd backend

# Apply migrations (after schema.prisma changes)
npx prisma migrate dev --name <description>

# Or in Docker:
docker compose exec backend npx prisma migrate dev --name <description>

# Regenerate Prisma client
npx prisma generate

# Run seed (idempotent — safe to run multiple times)
npm run prisma:seed

# Reset database (drops + re-applies migrations + seeds)
npx prisma migrate reset
```

---

## Environment Variables

| Variable                | Description                        | Default (Docker)                                  |
|-------------------------|------------------------------------|---------------------------------------------------|
| `DATABASE_URL`          | MySQL connection string            | `mysql://asset_user:asset_password@mysql:3306/asset_db` |
| `JWT_SECRET`            | JWT access token signing secret    | `dev_secret_change_in_production`                 |
| `JWT_REFRESH_SECRET`    | JWT refresh token signing secret   | `dev_refresh_secret_change_in_production`         |
| `JWT_EXPIRES_IN`        | Access token TTL                   | `15m`                                             |
| `JWT_REFRESH_EXPIRES_IN`| Refresh token TTL                  | `7d`                                              |
| `PORT`                  | Backend server port                | `3000`                                            |
| `NODE_ENV`              | Environment mode                   | `development`                                     |

---

## Stock Reservation Rules

| Module / Action | Reservation Type | When Reservation is Created | Reservation Behavior | Stock Enforcement |
|---|---|---|---|---|
| **Transfer Request (Outbound)** | Hard reservation | On **Origin Manager Approval** | Reserved quantity is deducted from available stock and displayed in stock dashboard; prevents other transfers from over-committing | Approval **blocked** if requested qty exceeds available stock; cannot finalize without active reservation |
| **Transfer Request (Inbound)** | Consumed | On **Finalization** | Reserved qty is removed and added to destination stock | Stock increases at destination, reservations cleared |
| **Transfer Reject / Cancel** | Release reservation | On **Reject** (from ORIGIN_MANAGER_APPROVED) or **Cancel** (from ORIGIN_MANAGER_APPROVED / READY_TO_FINALIZE) | Reserved qty is released and available stock updated | Stock remains unchanged; prevents stale reservations |
| **Adjustment Request (Outbound)** | None | Approval proceeds without creating reservation | Stock is checked at **approval** and again at **finalization** to ensure sufficient quantity | Approval **blocked** if available stock is insufficient; finalization will also fail if stock changed since approval |
| **Adjustment Request (Inbound / Positive Qty)** | None | Never | No reservation created | Stock is updated on finalization |
| **Adjustment Reject / Cancel** | N/A | N/A | N/A | Stock remains unchanged |
| **Stock Dashboard** | N/A | N/A | Displays `reservedQty` only for active transfer reservations | Outbound adjustment reservations not shown; available = onHand − reservedQty |

---



- **Stock integrity is the highest priority.** Stock may only change during FINALIZATION of requests.
- All stock operations must run inside database transactions.
- Ledger entries are immutable — never updated or deleted.
- Dependency flow: Controller → Service → Repository → Database (no skipping layers).
- See `/doc/ai_system_architecture.md` for full architectural guardrails.

---

## Development Phases

| Phase | Scope |
|---|---|
| 1 | Database schema + Prisma models |
| **2 (current)** | **Authentication, Users, Locations, Roles** |
| 3 | Master data (Goods, Vendors, Categories, UOM) |
| 4 | Stock balances + Ledger + Dashboard |
| 5 | Stock Adjustment module |
| 6 | Stock Movement module + Reservations |
| 7 | Audit log + Admin panels |

> Always follow the migration rules in `/doc/database_migration_rules.md` before modifying the database schema.
