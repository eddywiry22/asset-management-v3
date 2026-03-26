# Stage 1: Builder
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files dulu buat optimize Docker layer caching
COPY package*.json ./

# Pake 'npm ci' instead of 'npm install' biar deterministic
RUN npm ci

# Generate Prisma client sebelum copy full source
COPY prisma ./prisma
RUN npx prisma generate

COPY . .

# Stage 2: Runner
FROM node:20-alpine AS runner
WORKDIR /app

# 1. Install su-exec buat best practice step-down privilege di runtime
RUN apk add --no-cache su-exec


# 2. Copy hasil build dan set ownership ke node dari awal
COPY --from=builder --chown=node:node /app ./


# 3. Install OpenSSL for Prisma
RUN apk add --no-cache openssl

EXPOSE 3000

# 3. Container start as root -> bikin dir uploads -> ubah ownership volume ke node -> run app as node
# Jalankan prisma migrate deploy sebelum start server
CMD sh -c "mkdir -p uploads && chown -R node:node uploads && su-exec node sh -c 'npx prisma migrate deploy && npm run dev'"