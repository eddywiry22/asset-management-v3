# ── Stage 1: build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# VITE_API_BASE_URL must be passed at build time:
#   docker build --build-arg VITE_API_BASE_URL=https://api.yourdomain.com/api .
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

# ── Stage 2: serve with nginx ─────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

COPY --from=build /app/dist /usr/share/nginx/html

# nginx config: serve SPA with fallback to index.html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
