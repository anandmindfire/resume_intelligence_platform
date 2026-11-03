# Multi-stage build for API Gateway microservice
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
COPY apps/api-gateway-node/package.json ./apps/api-gateway-node/

# Install all dependencies (including dev dependencies for build)
RUN pnpm install --frozen-lockfile

# Copy source code for packages (dependencies)
COPY packages/config ./packages/config
COPY packages/logger ./packages/logger
COPY packages/http-kit ./packages/http-kit

# Copy source code for app
COPY apps/api-gateway-node ./apps/api-gateway-node

# Build packages first (they are dependencies)
WORKDIR /app/packages/config
RUN pnpm build

WORKDIR /app/packages/logger
RUN pnpm build

WORKDIR /app/packages/http-kit
RUN pnpm build

# Build the app
WORKDIR /app/apps/api-gateway-node
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
COPY apps/api-gateway-node/package.json ./apps/api-gateway-node/

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
COPY --from=builder /app/apps/api-gateway-node/dist ./apps/api-gateway-node/dist

WORKDIR /app/apps/api-gateway-node

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

EXPOSE 3000

# Use node directly (no need for pnpm in production)
CMD ["node", "dist/index.js"]
