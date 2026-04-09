FROM node:20-alpine

# Install Chromium and its dependencies for Puppeteer-core
RUN apk add --no-cache \
  chromium \
  nss \
  freetype \
  harfbuzz \
  ca-certificates \
  ttf-freefont

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

EXPOSE 3000

CMD sh -c "npx prisma migrate deploy && npm run dev"
