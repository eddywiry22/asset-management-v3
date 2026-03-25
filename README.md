# Asset Management System

An internal inventory management system for tracking products, stock levels, and movements across multiple warehouse locations.

---

## Key Features

- **Multi-location inventory** — stock is tracked independently per location
- **Product-location activation** — products must be registered at a location before stock operations can reference them there
- **Immutable stock ledger** — every stock change is recorded as a permanent ledger entry; balances are never edited directly
- **Adjustment workflows** — stock corrections go through a multi-step approval lifecycle (Draft → Pending → Approved → Finalized)
- **Transfer workflows** — inter-location transfers with hard reservations to prevent over-commitment
- **Advanced filtering + saved presets** — combinable multi-value filters with per-user saved presets across modules
- **Dashboard with My Actions** — personal action queue surfacing items awaiting your attention

---

## Core Concepts

| Concept | Description |
|---|---|
| **Product Registration** | A product must be explicitly activated at a location before it can hold stock there |
| **Stock Balance** | The current on-hand quantity per product per location, derived from the ledger |
| **Ledger** | Immutable log of every stock movement — never updated or deleted |
| **Adjustment** | A request to correct stock (add or remove quantity), requiring approval before it affects balances |
| **Transfer** | A movement of stock between locations; outbound quantity is reserved on origin-manager approval |
| **Reserved Quantity** | Quantity set aside for an approved transfer; reduces available stock without yet removing it |

> For deeper explanations see [`docs/system-overview.md`](docs/system-overview.md) and the module docs in [`docs/modules/`](docs/modules/).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express, TypeScript, Prisma ORM |
| Frontend | React, TypeScript, Vite, Material UI |
| Database | MySQL 8.0 |
| Runtime | Docker, Docker Compose |

---

## Project Structure

```
asset-management-v3/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma        # Source of truth for the data model
│   │   ├── seed.ts              # Idempotent seed script
│   │   └── migrations/
│   └── src/
│       ├── app.ts               # Express app + route registration
│       ├── modules/             # Feature modules (auth, products, stock, …)
│       │   └── <module>/        # controller, service, repository, routes, validator
│       ├── middlewares/         # auth, error handler, request logger
│       └── utils/               # errors, validation, date helpers
├── frontend/
│   └── src/
│       ├── modules/             # Page-level feature modules
│       ├── components/          # Shared UI components (FilterModal, Chips, …)
│       ├── hooks/               # Reusable hooks (useAdvancedFilters, …)
│       └── services/            # API client wrappers
├── docs/                        # Project documentation (see below)
└── docker-compose.yml
```

---

## Setup

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)

### Start all services

```bash
docker compose up --build
```

This starts MySQL on `3306`, the backend on `3000`, and the frontend on `5173`. Database migrations run automatically on backend startup.

### Seed demo data

```bash
docker compose exec backend npm run prisma:seed
```

The seed is idempotent — safe to run multiple times.

### Verify

```bash
curl http://localhost:3000/health
# → { "status": "OK", "timestamp": "..." }
```

Frontend: [http://localhost:5173](http://localhost:5173)

---

## Running in Development

All services run with live reload via Docker volumes. No local Node.js installation is required.

To run a service outside Docker:

```bash
# Backend
cd backend
npm install
npm run dev        # ts-node-dev, restarts on file changes

# Frontend
cd frontend
npm install
npm run dev        # Vite HMR
```

### Useful backend scripts

| Script | Description |
|---|---|
| `npm run dev` | Start dev server with live reload |
| `npm run build` | Compile TypeScript |
| `npm test` | Run Jest tests |
| `npm run prisma:migrate` | Apply pending migrations |
| `npm run prisma:seed` | Seed the database |

---

## Test Credentials

All demo accounts use the password **`password123`**.

| Role | Email | Location |
|---|---|---|
| Admin | `admin@example.com` | All locations |
| Manager | `manager1@example.com` | WH-001 — Main Warehouse (Jakarta) |
| Manager | `manager2@example.com` | WH-002 — Secondary Warehouse (Surabaya) |
| Manager | `manager3@example.com` | WH-003 — Northern Warehouse (Medan) |
| Operator | `operator1@example.com` | WH-001 |
| Operator | `operator2@example.com` | WH-002 |
| Operator | `operator3@example.com` | WH-003 |

---

## Environment Variables

Defaults are set in `docker-compose.yml` and are suitable for local development.

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | MySQL connection string | `mysql://asset_user:asset_password@mysql:3306/asset_db` |
| `JWT_SECRET` | Access token signing secret | `dev_secret_change_in_production` |
| `JWT_REFRESH_SECRET` | Refresh token signing secret | `dev_refresh_secret_change_in_production` |
| `JWT_EXPIRES_IN` | Access token TTL | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token TTL | `7d` |
| `PORT` | Backend port | `3000` |
| `NODE_ENV` | Environment mode | `development` |

> Change `JWT_SECRET` and `JWT_REFRESH_SECRET` before deploying to any shared environment.

---

## Documentation

### System

| Document | Description |
|---|---|
| [`docs/system-overview.md`](docs/system-overview.md) | High-level architecture and system design |
| [`docs/api/overview.md`](docs/api/overview.md) | API structure, auth, response format, filtering patterns |
| [`docs/ux/filters-and-presets.md`](docs/ux/filters-and-presets.md) | Filter system design — frontend and backend |

### Modules

| Document | Description |
|---|---|
| [`docs/modules/stock.md`](docs/modules/stock.md) | Stock balance and ledger module |
| [`docs/modules/adjustments.md`](docs/modules/adjustments.md) | Stock adjustment workflow |
| [`docs/modules/movements.md`](docs/modules/movements.md) | Stock movement and transfer workflow |
| [`docs/modules/product.md`](docs/modules/product.md) | Product master data |
| [`docs/modules/product-registration.md`](docs/modules/product-registration.md) | Product-location activation |
| [`docs/modules/dashboard.md`](docs/modules/dashboard.md) | Dashboard and My Actions |

### Architecture

| Document | Description |
|---|---|
| [`docs/architecture/backend.md`](docs/architecture/backend.md) | Backend architecture and conventions |
| [`docs/architecture/database.md`](docs/architecture/database.md) | Database schema and migration rules |

### Engineering

| Document | Description |
|---|---|
| [`docs/engineering/stock-consistency.md`](docs/engineering/stock-consistency.md) | Integrity rules governing stock state — required reading before modifying stock-adjacent code |
| [`docs/engineering/request-lifecycle.md`](docs/engineering/request-lifecycle.md) | Internal lifecycle of adjustment and transfer requests, including the critical finalization-only invariant |
| [`docs/engineering/permission-matrix.md`](docs/engineering/permission-matrix.md) | Complete authorization model — every role, location scope, and permitted action |

### Diagrams

| Document | Description |
|---|---|
| [`docs/diagrams/adjustment-sequence.md`](docs/diagrams/adjustment-sequence.md) | Step-by-step sequence of a stock adjustment from creation through finalization |
| [`docs/diagrams/movement-sequence.md`](docs/diagrams/movement-sequence.md) | Step-by-step sequence of a stock transfer, including reservation timing and actor responsibilities |

### Testing

| Document | Description |
|---|---|
| [`docs/testing/strategy.md`](docs/testing/strategy.md) | Testing strategy covering stock correctness, workflow scenarios, permission boundaries, seed data, and regression areas |

---

## Philosophy

- **Stock integrity is the highest priority.** Balances only change during finalization of approved requests — never as a side effect of any other operation.
- **The ledger is the source of truth.** Entries are immutable; balances are always derivable from it.
- **Workflows enforce correctness.** Adjustments and transfers cannot skip approval steps, regardless of who initiates them.
- **Layered architecture.** Every request flows Controller → Service → Repository → Database. No layer is skipped.
