# Multi-stage build for Frontend Dashboard microservice
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

# Copy app package.json
COPY apps/frontend-dashboard/package.json ./apps/frontend-dashboard/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy source code for app
COPY apps/frontend-dashboard ./apps/frontend-dashboard

# Build the app
WORKDIR /app/apps/frontend-dashboard
RUN pnpm build

# Production stage - Nginx
FROM nginx:alpine AS runner

# Copy built static files
COPY --from=builder /app/apps/frontend-dashboard/dist /usr/share/nginx/html

# Copy nginx configuration as template for environment variable substitution
COPY apps/frontend-dashboard/nginx.conf /etc/nginx/templates/default.conf.template

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
