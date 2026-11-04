# Multi-stage build for Analytics API microservice
FROM node:24-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

# Skip Husky in Docker (root prepare script runs husky; not needed in containers)
ENV HUSKY=0

# Builder stage
FROM base AS builder

WORKDIR /app

# Copy root package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY turbo.json ./
COPY tsconfig.base.json ./

# Copy package.json files for workspace resolution
COPY packages/config/package.json ./packages/config/
COPY packages/logger/package.json ./packages/logger/
COPY packages/http-kit/package.json ./packages/http-kit/

# Copy app package.json
COPY apps/analytics-api-node/package.json ./apps/analytics-api-node/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy source code for packages
COPY packages/config ./packages/config
COPY packages/logger ./packages/logger
COPY packages/http-kit ./packages/http-kit

# Copy source code for app
COPY apps/analytics-api-node ./apps/analytics-api-node

# Build packages first
WORKDIR /app/packages/config
RUN pnpm build

WORKDIR /app/packages/logger
RUN pnpm build

WORKDIR /app/packages/http-kit
RUN pnpm build

# Build the app
WORKDIR /app/apps/analytics-api-node
RUN pnpm build

# Production stage
FROM base AS runner

WORKDIR /app

# Copy root package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy package.json files
COPY packages/config/package.json ./packages/config/
COPY packages/logger/package.json ./packages/logger/
COPY packages/http-kit/package.json ./packages/http-kit/
COPY apps/analytics-api-node/package.json ./apps/analytics-api-node/

# Install only production dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy built packages
COPY --from=builder /app/packages/config/dist ./packages/config/dist
COPY --from=builder /app/packages/config/package.json ./packages/config/
COPY --from=builder /app/packages/logger/dist ./packages/logger/dist
COPY --from=builder /app/packages/logger/package.json ./packages/logger/
COPY --from=builder /app/packages/http-kit/dist ./packages/http-kit/dist
COPY --from=builder /app/packages/http-kit/package.json ./packages/http-kit/

# Copy built app
COPY --from=builder /app/apps/analytics-api-node/dist ./apps/analytics-api-node/dist

WORKDIR /app/apps/analytics-api-node

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3002/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

EXPOSE 3002

# Run as the unprivileged `node` user (uid 1000) from the base image, never root
USER node

CMD ["node", "dist/index.js"]
