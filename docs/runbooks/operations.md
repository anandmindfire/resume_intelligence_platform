# Operations Runbook

Day-to-day operations: starting/stopping the stack, scaling, backups, health checks, and load testing.

---

## 1. Starting the stack

### Option A: Docker Compose (full microservices)

```bash
# From repo root
pnpm run docker:microservices

# Or build then start
pnpm run docker:start:build

# Or use helper script (with status)
./scripts/start-all-services.sh --build
```

Direct Compose:

```bash
docker-compose -f infra/docker-compose/docker-compose.microservices.yml up -d
```

### Option B: Docker Compose (dev — Postgres + Redis only)

```bash
pnpm run docker:dev
# Then run apps locally: pnpm --filter @resume-platform/api-gateway dev, etc.
```

### Option C: Docker Swarm (production-style)

```bash
docker swarm init   # if not already
pnpm run swarm:deploy
# Or: ./scripts/deploy-swarm.sh
```

Check services:

```bash
docker stack services resume-platform
docker service ps resume-platform_upload-service-node
```

### Option D: Kubernetes (Production & Local)

#### Via Helm (Recommended):

```bash
# Development (single-node local, RWO storage, NodePort):
pnpm helm:install:dev

# Production (multi-replica, RWX storage, Ingress, TLS, HPA):
pnpm helm:install:prod
```

#### Via Kustomize (`kubectl`):

```bash
# Local development (Minikube / Kind / Docker Desktop):
pnpm k8s:start:dev

# Production cluster:
pnpm k8s:start:prod
```

Check status:

```bash
pnpm k8s:status
# Or:
kubectl get pods,svc,hpa,ingress -n resume-platform
```

---

## 2. Stopping the stack

### Compose

```bash
pnpm run docker:down
# Or:
docker-compose -f infra/docker-compose/docker-compose.microservices.yml down
```

### Swarm

```bash
pnpm run swarm:stop
# Or: ./scripts/stop-swarm.sh
```

### Kubernetes

```bash
# If deployed via Helm:
pnpm helm:uninstall

# If deployed via Kustomize:
pnpm k8s:stop

# To delete namespace and all PV data:
./scripts/teardown-k8s.sh --all
```

---

## 3. Health checks

### Full platform health (script)

```bash
./infra/health-checks/health-check.sh
```

Requires: `curl`, and for Postgres/Redis: `pg_isready`, `redis-cli` (or run script from a container that has them). Uses env: `POSTGRES_HOST`, `POSTGRES_PORT`, `REDIS_HOST`, `REDIS_PORT` (defaults: localhost, 5432, 6379).

### Individual services (curl)

| Service        | URL                                                          |
| -------------- | ------------------------------------------------------------ |
| API Gateway    | `curl -s http://localhost:3000/health`                       |
| Upload Service | `curl -s http://localhost:3001/health`                       |
| Analytics API  | `curl -s http://localhost:3002/health`                       |
| Frontend       | `curl -s -o /dev/null -w "%{http_code}" http://localhost:80` |
| Prometheus     | `curl -s http://localhost:9090/-/healthy`                    |
| Grafana        | `curl -s http://localhost:3030/api/health`                   |

### Postgres and Redis

```bash
pg_isready -h localhost -p 5432 -U postgres
redis-cli -h localhost -p 6379 ping
```

---

## 4. Scaling

### Docker Swarm — upload-service

To handle more upload throughput, scale upload-service:

```bash
./scripts/scale-upload.sh 5
# Or manually:
docker service scale resume-platform_upload-service-node=5
```

Check status:

```bash
docker service ps resume-platform_upload-service-node
docker service ls
```

Sizing: run the capacity test (see [Load testing](#6-load-testing)), get RPS per replica, then **replicas ≈ target_RPS / RPS_per_replica**. See `load-testing/README.md`.

### Docker Compose — scaled upload

Use the scale override:

```bash
pnpm run docker:start:scale:build
# Or: docker-compose -f infra/docker-compose/docker-compose.microservices.yml -f infra/docker-compose/docker-compose.scale.yml up -d
```

### Kubernetes — Scaling & Autoscaling

#### 1. Dynamic Auto-scaling (HPA v2)

Kubernetes automatically scales pods when CPU or Memory utilization thresholds are exceeded:

```bash
# View active autoscalers and real-time metrics:
kubectl get hpa -n resume-platform

# Adjust HPA min/max limits dynamically:
kubectl patch hpa upload-service-hpa -n resume-platform --patch '{"spec":{"maxReplicas":20,"minReplicas":5}}'
```

#### 2. Manual Replica Scaling

```bash
# Scale upload service replicas:
kubectl scale deployment upload-service --replicas=6 -n resume-platform

# Scale background OCR / parser workers:
kubectl scale deployment ocr-worker --replicas=8 -n resume-platform
kubectl scale deployment parser-worker --replicas=8 -n resume-platform
kubectl scale deployment matcher-worker --replicas=6 -n resume-platform

# Or update via Helm:
helm upgrade resume-platform infra/k8s/helm/resume-platform \
  --namespace resume-platform \
  --set uploadService.replicas=6 \
  --set workers.ocr.replicas=8
```

---

## 5. Backups

### PostgreSQL

```bash
pnpm infra:backup:postgres
# Or: ./infra/backup/scripts/backup-postgres.sh
```

Set `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `PGPASSWORD` if not localhost/defaults. Backups go to the path configured in `infra/backup/` (e.g. backup-config.yml / script).

### Redis

```bash
pnpm infra:backup:redis
# Or: ./infra/backup/scripts/backup-redis.sh
```

Schedule via cron as needed (e.g. Postgres daily, Redis every 6 hours). See `infra/README.md` and `infra/backup/`.

---

## 6. Load testing

### Prerequisites

- Stack running (Compose or Swarm).
- `BASE_URL=http://localhost:3000` (or your gateway URL). Scripts use Docker k6 when k6 is not in PATH.

### Commands

```bash
# Standard load (e.g. 100 VUs)
pnpm run load-test

# Smoke (light)
pnpm run load-test:smoke

# Stress
pnpm run load-test:stress

# Capacity (find max RPS)
BASE_URL=http://localhost:3000 pnpm exec k6 run load-testing/k6/upload-capacity.test.js
```

### Interpreting results

- **http_reqs** → throughput (RPS).
- **http_req_duration p(95)** → latency; if high, scale or tune `UPLOAD_MAX_CONCURRENT`.
- **http_req_failed** → keep &lt; 5–10%.

If you see **429**, increase gateway rate limit (e.g. `RATE_LIMIT_MAX`) for the test. See `load-testing/README.md`.

---

## 7. Database migrations

### Compose / Swarm:

```bash
./scripts/migrate-db.sh
```

Ensure Postgres is up and `.env` (or env) has correct `POSTGRES_*` settings. Migrations live in `infra/postgres/migrations/`.

### Kubernetes:

```bash
# Automated database schema initialization / migration in K8s:
pnpm k8s:init-db

# Or manually run psql inside the Postgres pod:
POD=$(kubectl get pod -n resume-platform -l app.kubernetes.io/name=postgres -o jsonpath='{.items[0].metadata.name}')
kubectl exec -i "$POD" -n resume-platform -- psql -U postgres -d resume_platform < infra/postgres/init.sql
```

---

## 8. Seeding job roles

```bash
pnpm run seed:jobs
# Or: bash scripts/seed-jobs.sh
```

---

## 9. Monitoring stack (optional)

To run Prometheus, Grafana, Loki, etc., after the main stack:

```bash
pnpm run docker:microservices   # start app stack first
pnpm run infra:start            # then monitoring
```

URLs: Prometheus 9090, Grafana 3030, Alertmanager 9093. See `infra/README.md`.

---

## 10. SSL (development)

```bash
pnpm infra:ssl:generate
# Creates certs in infra/ssl/dev/ (or path from script)
```

Use for local HTTPS if required by frontend or APIs.
