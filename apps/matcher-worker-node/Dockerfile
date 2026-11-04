# Multi-stage build for Matcher Worker microservice
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

# Copy package.json files
COPY packages/config/package.json ./packages/config/
COPY packages/logger/package.json ./packages/logger/
COPY packages/queue-lib/package.json ./packages/queue-lib/
COPY packages/role-matching/package.json ./packages/role-matching/
COPY packages/resume-nlp/package.json ./packages/resume-nlp/

# Copy app package.json
COPY apps/matcher-worker-node/package.json ./apps/matcher-worker-node/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy source code for packages
COPY packages/config ./packages/config
COPY packages/logger ./packages/logger
COPY packages/queue-lib ./packages/queue-lib
COPY packages/role-matching ./packages/role-matching
COPY packages/resume-nlp ./packages/resume-nlp

# Copy source code for app
COPY apps/matcher-worker-node ./apps/matcher-worker-node

# Build packages first
WORKDIR /app/packages/config
RUN pnpm build

WORKDIR /app/packages/logger
RUN pnpm build

WORKDIR /app/packages/queue-lib
RUN pnpm build

WORKDIR /app/packages/resume-nlp
RUN pnpm build

WORKDIR /app/packages/role-matching
RUN pnpm build

# Build the app
WORKDIR /app/apps/matcher-worker-node
RUN pnpm build

# Production stage
FROM base AS runner

WORKDIR /app

# Copy root package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy package.json files
COPY packages/config/package.json ./packages/config/
COPY packages/logger/package.json ./packages/logger/
COPY packages/queue-lib/package.json ./packages/queue-lib/
COPY packages/role-matching/package.json ./packages/role-matching/
COPY packages/resume-nlp/package.json ./packages/resume-nlp/
COPY apps/matcher-worker-node/package.json ./apps/matcher-worker-node/

# Install only production dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy built packages
COPY --from=builder /app/packages/config/dist ./packages/config/dist
COPY --from=builder /app/packages/config/package.json ./packages/config/
COPY --from=builder /app/packages/logger/dist ./packages/logger/dist
COPY --from=builder /app/packages/logger/package.json ./packages/logger/
COPY --from=builder /app/packages/queue-lib/dist ./packages/queue-lib/dist
COPY --from=builder /app/packages/queue-lib/package.json ./packages/queue-lib/
COPY --from=builder /app/packages/resume-nlp/dist ./packages/resume-nlp/dist
COPY --from=builder /app/packages/resume-nlp/package.json ./packages/resume-nlp/
COPY --from=builder /app/packages/role-matching/dist ./packages/role-matching/dist
COPY --from=builder /app/packages/role-matching/package.json ./packages/role-matching/

# Copy built app
COPY --from=builder /app/apps/matcher-worker-node/dist ./apps/matcher-worker-node/dist

WORKDIR /app/apps/matcher-worker-node

# Run as the unprivileged `node` user (uid 1000) from the base image, never root
USER node

CMD ["node", "dist/index.js"]
