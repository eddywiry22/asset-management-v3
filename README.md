# Asset Management System

An internal inventory management system for tracking products, stock levels, and movements across multiple warehouse locations.

---

## Key Features

- **Multi-location inventory** — stock is tracked independently per location
- **Product-location activation** — products must be registered at a location before stock operations can reference them there
- **Immutable stock ledger** — every stock change is recorded as a permanent ledger entry; balances are never edited directly
- **Adjustment workflows** — stock corrections go through a multi-step approval lifecycle (Draft → Submitted → Approved → Finalized)
- **Transfer workflows** — inter-location transfers with hard reservations to prevent over-commitment
- **Real-time activity timeline** — every request has a live-updating feed of status changes, comments, and attachments via Server-Sent Events (SSE)
- **Stock Opname reporting** — point-in-time inventory report with browser-based print output (no server-side PDF)
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
| **Timeline** | A unified activity feed per request — status events (from AuditLog), comments, and attachments aggregated at read time |
| **Stock Opname** | A historical inventory report derived entirely from the ledger; printed via the browser using `window.print()` |

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

## Getting Started

For full instructions see **[docs/setup.md](docs/setup.md)**.

### Quick start (Docker)

```bash
# Start all services (MySQL, backend, frontend)
docker compose up --build

# In a second terminal, seed demo data
docker compose exec backend npm run prisma:seed
```

| Service | URL |
|---|---|
| Frontend | `http://localhost:5173` |
| Backend health | `http://localhost:3000/health` |

### Test credentials (password: `password123`)

| Role | Email |
|---|---|
| Admin | `admin@example.com` |
| Manager (WH-001) | `manager1@example.com` |
| Operator (WH-001) | `operator1@example.com` |

See [docs/setup.md — First Login](docs/setup.md#5-first-login) for all accounts.

### Useful backend scripts

| Script | Description |
|---|---|
| `npm run dev` | Start dev server with live reload (ts-node-dev) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm test` | Run Jest tests |
| `npm run prisma:migrate` | Create and apply a migration (dev only) |
| `npm run prisma:seed` | Seed demo data (idempotent) |

---

## Deployment

See **[docs/deployment.md](docs/deployment.md)** for:
- Production build steps (backend + frontend)
- Reverse proxy configuration (Nginx example)
- SSE requirements (`proxy_buffering off`)
- File upload persistence
- Environment variable reference

---

## Documentation

### Operational

| Document | Description |
|---|---|
| [`docs/setup.md`](docs/setup.md) | Local development setup — Docker and non-Docker paths, environment variables, seeding |
| [`docs/deployment.md`](docs/deployment.md) | Production build, reverse proxy (Nginx), SSE requirements, file upload persistence |
| [`docs/troubleshooting.md`](docs/troubleshooting.md) | Common problems — timeline, SSE, reports, Docker, print, auth |

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
| [`docs/modules/timeline.md`](docs/modules/timeline.md) | Real-time activity timeline — SSE, REST, event structure |
| [`docs/modules/comments.md`](docs/modules/comments.md) | Comment threading and edit/delete rules |
| [`docs/modules/attachments.md`](docs/modules/attachments.md) | File upload, download, and authorization |
| [`docs/modules/reports.md`](docs/modules/reports.md) | Stock Opname report — quantities, filters, print |
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
