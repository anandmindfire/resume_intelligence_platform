# Infrastructure

Infrastructure configuration for the Resume Intelligence Platform.

## Structure

| Path              | Purpose                                                                       |
| ----------------- | ----------------------------------------------------------------------------- |
| `ansible/`        | Ansible playbooks for server provisioning and deployment                      |
| `backup/`         | Backup configuration and scripts (Postgres, Redis)                            |
| `docker/`         | Docker Compose for monitoring, logging, and observability                     |
| `docker-compose/` | App Compose files (dev, prod, microservices, scale)                           |
| `k8s/`            | Production Kubernetes architecture (Base, Overlays, Ingress, HPA, Helm Chart) |
| `swarm/`          | Docker Swarm stack for production deployment                                  |
| `health-checks/`  | Health check script for all platform services                                 |
| `logging/`        | Loki and Promtail configs for log aggregation                                 |
| `monitoring/`     | Prometheus, Grafana, Alertmanager configs                                     |
| `nginx/`          | Nginx reverse proxy config (optional, for production)                         |
| `postgres/`       | PostgreSQL init script and migrations                                         |
| `redis/`          | Redis server configuration                                                    |
| `ssl/`            | SSL certificate generation scripts                                            |

## Quick Start

### Start Full Stack with Monitoring

```bash
pnpm docker:start:full
# Starts microservices + Prometheus, Grafana, Loki, etc.
```

### Run Infra Only (after microservices are running)

```bash
pnpm infra:start
```

### Health Check

```bash
pnpm infra:health
```

### Backups

```bash
# PostgreSQL (set POSTGRES_HOST=localhost for local)
pnpm infra:backup:postgres

# Redis
pnpm infra:backup:redis
```

### SSL Certificates (Development)

```bash
pnpm infra:ssl:generate
# Creates infra/ssl/dev/cert.pem and key.pem
```

## Monitoring Stack

- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3030 (admin/admin)
- **Alertmanager**: http://localhost:9093

## Docker Compose (App)

App Compose files in `docker-compose/`:

- **docker-compose.microservices.yml** — full stack (default)
- **docker-compose.dev.yml** — Postgres + Redis only (local dev)
- **docker-compose.prod.yml** — Swarm-style prod layout
- **docker-compose.scale.yml** — override for scaled upload-service

```bash
pnpm docker:microservices   # full stack
pnpm docker:dev            # dev (Postgres + Redis only)
```

## Kubernetes & Production Load Balancing

Production-ready Kubernetes setup with ingress routing, least-connection load balancing, and Horizontal Pod Autoscaling (HPA) in `k8s/`:

```bash
# Deploy with Helm (dev or prod profile)
pnpm helm:install:dev
pnpm helm:install:prod

# Or deploy with kubectl kustomize
pnpm k8s:start:dev
pnpm k8s:start:prod

# Check status
pnpm k8s:status
```

See `k8s/README.md` for full documentation on architecture, ingress, storage classes, and production readiness.

## Docker Swarm

`swarm/stack.yml` — production deployment with replicas.

```bash
pnpm swarm:deploy
pnpm swarm:start           # no rebuild
```

## Monitoring Stack (Infra)

The `docker/docker-compose.infra.yml` expects the `resume-platform` network to exist. Run microservices first:

```bash
pnpm docker:microservices   # or docker:start
pnpm infra:start           # then start monitoring stack
```

Volume paths in the infra compose are relative to `infra/docker/` (e.g. `../monitoring/`).

## Ansible Deployment

```bash
cd infra/ansible
ansible-playbook -i inventory.yml playbook.yml
```

Update `inventory.yml` with your server IPs and credentials. Ensure templates in `templates/` are configured for your environment.

## Nginx

The `nginx/nginx.conf` provides a reverse proxy layout. To use:

1. Add nginx service to your docker-compose
2. Mount `infra/nginx/nginx.conf` into the container
3. Update upstream hostnames to match your service names

## Backup Configuration

See `backup/backup-config.yml` for schedule and retention settings. Configure cron to run:

- `infra/backup/scripts/backup-postgres.sh` (e.g. daily)
- `infra/backup/scripts/backup-redis.sh` (e.g. every 6 hours)
