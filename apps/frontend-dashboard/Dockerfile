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

# OIDC login settings are baked into the bundle at build time. Leave VITE_OIDC_AUTHORITY empty to build
# without login (local development only; the gateway refuses unauthenticated requests in production).
ARG VITE_OIDC_AUTHORITY=""
ARG VITE_OIDC_CLIENT_ID=""
ARG VITE_OIDC_SCOPE=""
ARG VITE_OIDC_AUDIENCE=""
ENV VITE_OIDC_AUTHORITY=$VITE_OIDC_AUTHORITY \
    VITE_OIDC_CLIENT_ID=$VITE_OIDC_CLIENT_ID \
    VITE_OIDC_SCOPE=$VITE_OIDC_SCOPE \
    VITE_OIDC_AUDIENCE=$VITE_OIDC_AUDIENCE

# Build the app
WORKDIR /app/apps/frontend-dashboard
RUN pnpm build

# Production stage - Nginx
# nginx-unprivileged runs as uid 101 and listens on 8080 (no root needed to bind)
FROM nginxinc/nginx-unprivileged:alpine AS runner

# Copy built static files
COPY --from=builder /app/apps/frontend-dashboard/dist /usr/share/nginx/html

# IdP origin (scheme://host[:port]) added to the CSP so the SPA may call the IdP's token endpoint and
# frame its silent-renew page. Substituted into nginx.conf at container start; empty = no IdP.
ENV OIDC_ISSUER_ORIGIN=""

# Copy nginx configuration as template for environment variable substitution
COPY apps/frontend-dashboard/nginx.conf /etc/nginx/templates/default.conf.template

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:8080/ || exit 1

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
