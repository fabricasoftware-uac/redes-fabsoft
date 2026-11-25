# Stage 1: Build TypeScript
FROM node:22-slim AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci || npm install

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# Stage 2: Production runtime
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

# Install production dependencies only (ensuring native sharp & resvg binaries match linux arch)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copy compiled output and runtime assets
COPY --from=builder /app/dist ./dist
COPY migrations ./migrations
COPY logos ./logos

EXPOSE 3000

CMD ["node", "dist/index.js"]
