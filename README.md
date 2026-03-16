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

### 2. Run database migrations

Once the containers are running, open a new terminal and execute:

```bash
docker compose exec backend npx prisma migrate dev --name init
```

### 3. Generate Prisma client

```bash
docker compose exec backend npx prisma generate
```

### 4. Run seed script

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
│   │   └── seed.ts             # Seed script
│   ├── src/
│   │   ├── app.ts              # Express app setup
│   │   ├── server.ts           # Server entry point
│   │   ├── config/             # env, database config
│   │   ├── middlewares/        # auth, error middleware
│   │   ├── modules/            # Feature modules (auth, goods, stock, ...)
│   │   └── utils/              # Logger and helpers
│   ├── tests/                  # Jest tests
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── main.tsx            # React entry point
│   │   ├── App.tsx             # Root app with providers
│   │   ├── api/client.ts       # Axios API client
│   │   ├── routes/router.tsx   # React Router config
│   │   ├── theme/theme.ts      # MUI theme
│   │   ├── modules/            # Domain UI modules
│   │   └── components/         # Shared components
│   ├── Dockerfile
│   └── package.json
├── doc/                        # Project documentation
├── docker-compose.yml
└── README.md
```

---

## Development Workflow

Follow the implementation phases defined in `/doc/product_spec.md`:

1. **Phase 1** — Database schema + Prisma models
2. **Phase 2** — Authentication, Users, Locations, Roles
3. **Phase 3** — Master data (Goods, Vendors, Categories, UOM)
4. **Phase 4** — Stock balances + Ledger + Dashboard
5. **Phase 5** — Stock Adjustment module
6. **Phase 6** — Stock Movement module + Reservations
7. **Phase 7** — Audit log + Admin panels

> Always follow the migration rules in `/doc/database_migration_rules.md` before modifying the database schema.

---

## Environment Variables

Copy `.env.example` to `.env` in the `/backend` folder and update values as needed:

```bash
cp backend/.env.example backend/.env
```

| Variable       | Description                        | Default (Docker)                                  |
|----------------|------------------------------------|---------------------------------------------------|
| `DATABASE_URL` | MySQL connection string            | `mysql://asset_user:asset_password@mysql:3306/asset_db` |
| `JWT_SECRET`   | JWT signing secret                 | `dev_secret_change_in_production`                 |
| `PORT`         | Backend server port                | `3000`                                            |
| `NODE_ENV`     | Environment mode                   | `development`                                     |

---

## Architecture Notes

- **Stock integrity is the highest priority.** Stock may only change during FINALIZATION of requests.
- All stock operations must run inside database transactions.
- Ledger entries are immutable — never updated or deleted.
- See `/doc/ai_system_architecture.md` for full architectural guardrails.
