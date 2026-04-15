# Deployment Guide

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Build Steps](#2-build-steps)
3. [Environment Configuration](#3-environment-configuration)
4. [Reverse Proxy](#4-reverse-proxy)
5. [SSE (Real-Time Timeline)](#5-sse-real-time-timeline)
6. [File Uploads](#6-file-uploads)
7. [Print and Reports](#7-print-and-reports)

---

## 1. Architecture Overview

```
Browser
  │
  ├── GET /*           → Static file server  (frontend/dist/)
  └── /api/v1/*        → Reverse proxy  ──►  Backend :3000
                                                   │
                                             Node.js / Express
                                             Prisma ORM
                                                   │
                                              MySQL 8.0 :3306
```

| Component | Technology | Default port |
|---|---|---|
| Backend | Node.js 20, Express, TypeScript, Prisma | 3000 |
| Frontend | React SPA (Vite build output) | served by proxy |
| Database | MySQL 8.0 | 3306 |

The frontend is a statically built SPA. It uses `/api/v1` as its API base — a relative path, so API requests go to the same origin as the page. Your reverse proxy routes those requests to the backend and strips the `/api` prefix.

---

## 2. Build Steps

### Backend

```bash
cd backend

# Install production dependencies only
npm install --omit=dev

# Generate Prisma client (required — not included in node_modules)
npx prisma generate

# Apply all pending migrations (safe to run on every deploy)
npx prisma migrate deploy

# Compile TypeScript
npm run build

# Start production server
node dist/server.js
```

The server validates `DATABASE_URL` and `JWT_SECRET` at startup. If either is missing it exits immediately with an error message.

### Frontend

```bash
cd frontend

npm install --omit=dev

# Compile TypeScript + bundle with Vite
npm run build
```

Output goes to `frontend/dist/`. Serve this directory as static files.

Because this is a SPA, configure your web server to return `index.html` for all routes that do not resolve to a static file (404 fallback to `index.html`).

---

## 3. Environment Configuration

### Backend — required for production

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | `mysql://<user>:<password>@<host>:3306/<db>` | Full connection string |
| `JWT_SECRET` | Random 64-byte hex string | **Never use the development default** |
| `JWT_REFRESH_SECRET` | Separate random 64-byte hex string | **Never use the development default** |
| `JWT_EXPIRES_IN` | `15m` | Adjust to your session policy |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Adjust to your session policy |
| `PORT` | `3000` | Match what your infra routes to |
| `NODE_ENV` | `production` | Affects logging behavior |

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Run this twice — once for `JWT_SECRET`, once for `JWT_REFRESH_SECRET`. They must be different values.

### Frontend

No environment variables are required. The API base URL is `/api/v1` (a relative path baked into the build). Your reverse proxy handles the routing from `/api` to the backend.

---

## 4. Reverse Proxy

Your reverse proxy must do two things:

1. Serve the `frontend/dist/` directory with an SPA fallback (return `index.html` for unmatched routes).
2. Forward requests at `/api/` to the backend on port 3000, **stripping the `/api` prefix**.

The strip is required because the backend routes are registered at `/v1/...`, not `/api/v1/...`. A request for `/api/v1/dashboard` must reach the backend as `/v1/dashboard`.

### Nginx example

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Frontend — SPA static files
    root /srv/app/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # API — proxy to backend, strip /api prefix
    location /api/ {
        proxy_pass         http://127.0.0.1:3000/;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;

        # Required for SSE — disable response buffering
        proxy_buffering    off;
        proxy_cache        off;
        proxy_read_timeout 3600s;
        proxy_set_header   Connection '';
    }
}
```

> `proxy_buffering off` applies to all API routes in this example, which is safe. If you prefer, isolate it to a `location /api/v1/timeline/stream/` block.

---

## 5. SSE (Real-Time Timeline)

The activity timeline uses Server-Sent Events. This affects both authentication and proxy configuration.

### Authentication workaround

The browser's `EventSource` API cannot send custom request headers. JWT authentication is handled by passing the token as a query parameter instead of an `Authorization` header:

```
GET /api/v1/timeline/stream/:entityType/:entityId?token=<access_token>
```

The backend verifies this token using the same `authService.verifyAccessToken()` method used for all other routes. The SSE route is intentionally not behind the standard `authMiddleware` because of this — it performs its own token check.

**Do not strip query parameters** on the stream path at your proxy.

### Proxy requirements

SSE is a long-lived HTTP/1.1 connection that streams `data:` lines as events occur. Any proxy that buffers the response body will suppress events until the buffer fills (or the connection closes), breaking real-time delivery.

Required proxy settings:

```
proxy_buffering off      — disables Nginx output buffer
proxy_cache off          — disables caching
proxy_read_timeout 3600s — keeps the connection alive (events can be infrequent)
Connection: ''           — prevents proxy from signalling connection close
```

### Horizontal scaling limitation

SSE subscriber state is kept in memory on each backend process. Events emitted by one process are not delivered to clients connected to a different process. If you run multiple backend instances behind a load balancer, a client connected to instance A will not receive events from instance B.

Resolving this requires a shared pub/sub layer (e.g., Redis Pub/Sub). This is not currently implemented. For now, run a single backend instance or use sticky sessions at the load balancer.

---

## 6. File Uploads

Uploaded attachments are saved to the server filesystem:

```
<backend working dir>/uploads/<ADJUSTMENT|TRANSFER>/<requestId>/<uuid>-<originalname>
```

The `uploads/` directory is created automatically at backend startup (`fs.mkdirSync` in `server.ts`).

**In production, this directory must be on a persistent volume.** If it is inside an ephemeral container filesystem, all uploaded files are lost on container restart.

Docker Compose:

```yaml
services:
  backend:
    volumes:
      - uploads_data:/app/uploads

volumes:
  uploads_data:
    driver: local
```

Without persistence, the file is deleted from disk but its database record may still exist, causing 404 errors on download attempts.

---

## 7. Print and Reports

The Stock Opname report is printed using `window.print()` in the browser. The preview rendered in the report modal **is** the print layout. There is no server-side PDF generation — no Puppeteer, Chromium, or headless browser is required on the server.

Print layout is controlled by `@media print` CSS. The report content is rendered inside `<div id="print-area">`. The modal chrome (filters, buttons) is hidden via print CSS.

No additional server configuration is needed for reports.
