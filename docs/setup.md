# Local Development Setup

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Environment Variables](#2-environment-variables)
3. [Running Locally](#3-running-locally)
4. [Database Setup](#4-database-setup)
5. [First Login](#5-first-login)

---

## 1. Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | **20** | Matches `node:20-alpine` in the Dockerfiles |
| Docker | Any recent | Required for MySQL (at minimum) |
| Docker Compose | v2+ | `docker compose` (space, not hyphen) |
| npm | Bundled with Node | No global extras needed |

---

## 2. Environment Variables

### Backend — `backend/.env`

Copy the provided example:

```bash
cp backend/.env.example backend/.env
```

| Variable | Required | Dev default | Description |
|---|---|---|---|
| `DATABASE_URL` | **Yes** | — | MySQL connection string |
| `JWT_SECRET` | **Yes** | `dev_secret` | Access token signing key |
| `JWT_REFRESH_SECRET` | No | `dev_refresh_secret` | Refresh token signing key |
| `JWT_EXPIRES_IN` | No | `15m` | Access token TTL |
| `JWT_REFRESH_EXPIRES_IN` | No | `7d` | Refresh token TTL |
| `PORT` | No | `3000` | Backend listen port |
| `NODE_ENV` | No | `development` | Environment mode |

> `DATABASE_URL` and `JWT_SECRET` are validated at startup (`validateEnv()`). The server will refuse to start if either is missing.

### Frontend

No `.env` file is needed. The frontend API client uses the hardcoded base path `/api/v1`, which is a relative URL routed through the Vite dev server proxy. No `VITE_*` variables are required.

---

## 3. Running Locally

### Option A — With Docker (recommended)

One command starts MySQL, the backend, and the frontend with live reload:

```bash
# From the project root:
docker compose up --build
```

| Service | URL |
|---|---|
| Frontend | `http://localhost:5173` |
| Backend | `http://localhost:3000` |
| MySQL | `localhost:3306` |

Prisma migrations run automatically when the backend container starts (`prisma migrate deploy` is called before `npm run dev` in the container CMD). You do not need to run them manually.

**Seed demo data** (run after the backend is healthy):

```bash
docker compose exec backend npm run prisma:seed
```

The seed is idempotent — safe to run multiple times.

**Verify the backend is up:**

```bash
curl http://localhost:3000/health
# → {"status":"OK","timestamp":"..."}
```

---

### Option B — Without Docker

You need a running MySQL 8.0 instance. The simplest approach is to use Docker only for the database:

```bash
# Start MySQL only (detached)
docker compose up mysql -d
```

This starts MySQL on `localhost:3306` with:
- Database: `asset_db`
- User: `asset_user` / Password: `asset_password`

#### Backend

```bash
cd backend

# 1. Configure environment
cp .env.example .env
# Edit .env — set DATABASE_URL to connect to localhost:
#   DATABASE_URL="mysql://asset_user:asset_password@localhost:3306/asset_db"

# 2. Install dependencies
npm install

# 3. Generate Prisma client
npx prisma generate

# 4. Apply database migrations
npx prisma migrate dev

# 5. Start dev server (live reload via ts-node-dev)
npm run dev
```

Backend runs on `http://localhost:3000`.

#### Frontend

The Vite dev server proxies `/api` to `http://backend:3000`. That hostname resolves inside Docker but **not** on your local machine. Before starting the frontend, update the proxy target:

```diff
# frontend/vite.config.ts
proxy: {
  '/api': {
-   target: 'http://backend:3000',
+   target: 'http://localhost:3000',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api/, ''),
  },
},
```

Then:

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`.

> Do not commit the `vite.config.ts` change — it only applies to your local non-Docker setup.

#### Seed demo data

```bash
cd backend
npm run prisma:seed
```

---

## 4. Database Setup

### Migration commands

| Command | When to use |
|---|---|
| `npx prisma generate` | After any change to `backend/prisma/schema.prisma` — regenerates the Prisma client |
| `npx prisma migrate dev` | Local development — creates a migration file for schema changes and applies it |
| `npx prisma migrate deploy` | CI and production — applies existing migration files without creating new ones |

Migration files live in `backend/prisma/migrations/`. Always commit migration files alongside schema changes.

### What the seed creates

Running `npm run prisma:seed` (or `docker compose exec backend npm run prisma:seed`) creates:

| Data | Details |
|---|---|
| Locations | WH-001 (Jakarta), WH-002 (Surabaya), WH-003 (Medan) |
| Users | 1 admin, 3 managers, 3 operators (password: `password123`) |
| Master data | 3 categories, 3 vendors, 4 UOMs, 9 products |
| Stock | 10 units per product per location (with ledger entries) |
| Workflow data | Sample adjustments and transfers in various statuses for dashboard testing |

---

## 5. First Login

All demo accounts use the password **`password123`**.

| Role | Email | Assigned location |
|---|---|---|
| Admin | `admin@example.com` | All locations (no restriction) |
| Manager | `manager1@example.com` | WH-001 — Main Warehouse |
| Manager | `manager2@example.com` | WH-002 — Secondary Warehouse |
| Manager | `manager3@example.com` | WH-003 — Northern Warehouse |
| Operator | `operator1@example.com` | WH-001 |
| Operator | `operator2@example.com` | WH-002 |
| Operator | `operator3@example.com` | WH-003 |

> Demo accounts are only available after running the seed script.

**Tip for testing the dashboard:** Log in as `manager1` to see pending approvals, or as `operator2` to see incoming transfers and items ready to finalize.
