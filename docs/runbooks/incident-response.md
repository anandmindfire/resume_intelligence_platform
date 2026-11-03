# Incident Response Runbook

Steps for handling common incidents: unhealthy services, queue backlogs, database or Redis issues, and recovery.

---

## 1. One or more services unhealthy

### 1.1 Run health check

```bash
./infra/health-checks/health-check.sh
```

Note which service(s) report **Unhealthy**.

### 1.2 Check service status (Compose)

```bash
docker-compose -f infra/docker-compose/docker-compose.microservices.yml ps
docker-compose -f infra/docker-compose/docker-compose.microservices.yml logs --tail=100 <service-name>
```

Example service names: `api-gateway`, `upload-service`, `analytics-api`, `ocr-worker`, `parser-worker`, `matcher-worker`, `export-worker`, `insights-worker`, `frontend-dashboard`, `postgres`, `redis`.

### 1.3 Check service status (Swarm)

```bash
docker stack services resume-platform
docker service ps resume-platform_<service-name> --no-trunc
docker service logs resume-platform_<service-name> --tail=100
```

### 1.4 Check service status (Kubernetes)

```bash
# Check all pods, status, and restarts:
kubectl get pods -n resume-platform -o wide

# Check recent events on an unhealthy pod:
kubectl describe pod <pod-name> -n resume-platform

# Check pod logs:
kubectl logs <pod-name> -n resume-platform --tail=100
```

### 1.5 Common causes

- **Postgres or Redis down** → APIs and workers that depend on them will fail. Start infra first, then apps. See [Database / Redis issues](#2-database-or-redis-issues).
- **Port conflict** → Another process using the same port. Change port in Compose/Swarm or stop the conflicting process (e.g. `lsof -i :3000`).
- **Out of memory / OOM** → Check `docker stats` or `kubectl top pods -n resume-platform`. Scale workers or increase memory; for upload-service, consider lowering `UPLOAD_MAX_CONCURRENT` or adding replicas.
- **Config / env** → Missing or wrong `POSTGRES_*`, `REDIS_*`, or service URLs (e.g. `UPLOAD_SERVICE_URL`, `ANALYTICS_API_URL` in gateway). Verify `.env`, `platform-config`, or Helm values.

### 1.6 Restarting or Rolling Back a service

**Compose:**

```bash
docker-compose -f infra/docker-compose/docker-compose.microservices.yml restart <service-name>
```

**Swarm:**

```bash
docker service update --force resume-platform_<service-name>
```

**Kubernetes:**

```bash
# Graceful rolling restart of a deployment:
kubectl rollout restart deployment/<deployment-name> -n resume-platform

# Rollback a failed deployment release:
kubectl rollout undo deployment/<deployment-name> -n resume-platform

# Or rollback the entire Helm release:
helm rollback resume-platform -n resume-platform
```

Restart dependencies if needed (e.g. restart workers after Redis is back).

---

## 2. Database or Redis issues

### 2.1 PostgreSQL not accepting connections

- **Check process:** `docker ps | grep postgres` (Compose) or `docker service ps resume-platform_postgres`.
- **Check logs:** `docker-compose logs postgres` or `docker service logs resume-platform_postgres`.
- **Connect manually:** `docker exec -it <postgres-container> psql -U postgres -d resume_platform` (Compose) or use a postgres client with host/port from the stack.
- **Disk:** Ensure volume has space; check `df` and Postgres data dir.
- **Recovery:** If DB is corrupted, restore from latest backup (see [Operations — Backups](../operations.md#5-backups)).

### 2.2 Redis not accepting connections

- **Check process:** `docker ps | grep redis` or `docker service ps resume-platform_redis`.
- **Ping:** `redis-cli -h localhost -p 6379 ping` (from host or a container on the same network).
- **Logs:** `docker-compose logs redis` or `docker service logs resume-platform_redis`.
- **Memory:** Redis can be evicting keys under memory pressure; check `redis-cli info memory`. Restart Redis if needed; queues will be re-fed by producers on retry or on next upload.

### 2.3 After DB or Redis recovery

1. Ensure Postgres/Redis are healthy (health-check script or manual check).
2. Restart application services and workers so they reconnect:
   - **Compose:** `docker-compose -f infra/docker-compose/docker-compose.microservices.yml restart` (or restart each app service).
   - **Swarm:** `docker service update --force resume-platform_upload-service-node resume-platform_analytics-api` (and other services as needed).

---

## 3. Queue backlog (jobs not processing)

### 3.1 Identify which queue

- **ocr-queue** (Redis list) — OCR worker (Python) consumes it. If backlog grows, OCR workers may be down or slow.
- **parser-queue** (Redis list) — Parser worker (Python). Backlog = parsing is slower than enqueue rate or workers down.
- **matcher-queue** (BullMQ) — Matcher worker (Node). Same idea.
- **export-queue** (BullMQ) — Export worker (Node).

### 3.2 Check workers

**Compose:**

```bash
docker-compose -f infra/docker-compose/docker-compose.microservices.yml ps ocr-worker parser-worker matcher-worker export-worker
docker-compose -f infra/docker-compose/docker-compose.microservices.yml logs --tail=200 ocr-worker parser-worker matcher-worker
```

**Swarm:**

```bash
docker service ps resume-platform_ocr-worker resume-platform_parser-worker resume-platform_matcher-worker
docker service logs resume-platform_parser-worker --tail=200
```

**Kubernetes:**

```bash
# Check worker status and logs:
kubectl get pods -n resume-platform -l app.kubernetes.io/component=worker
kubectl logs -l app.kubernetes.io/name=ocr-worker -n resume-platform --tail=200 -f

# Emergency scale workers under high backlog:
kubectl scale deployment ocr-worker --replicas=8 -n resume-platform
kubectl scale deployment parser-worker --replicas=8 -n resume-platform
kubectl scale deployment matcher-worker --replicas=6 -n resume-platform
```

Restart workers if they exited or are stuck: `docker-compose restart ocr-worker parser-worker`, `docker service update --force resume-platform_ocr-worker`, or `kubectl rollout restart deployment/ocr-worker -n resume-platform`.

### 3.3 Check Redis queue length (Redis lists)

```bash
redis-cli -h localhost -p 6379 LLEN ocr-queue
redis-cli -h localhost -p 6379 LLEN parser-queue
```

If numbers are very high, scale workers (e.g. more parser-worker replicas in Compose/Swarm) or fix the cause of slowness (DB, CPU, memory).

### 3.4 BullMQ queues

Use BullMQ dashboard or Redis to inspect job counts. Ensure matcher-worker and export-worker are running and have no repeated errors in logs.

### 3.5 Resumes stuck in "pending"

Usually means OCR or parser never completed. Check:

1. OCR worker running and consuming `ocr-queue`.
2. Parser worker running and consuming `parser-queue`.
3. No repeated errors in worker logs (e.g. missing file, DB error). Fix underlying issue and optionally re-queue or re-upload affected resumes.

---

## 4. High error rate or 5xx from API

- **Gateway 502/503** — Upstream (upload-service or analytics-api) down or unreachable. Check those services and their env (URLs) in the gateway.
- **Upload 500** — Check upload-service logs (DB, Redis, disk for uploads dir). Ensure Postgres and Redis are up.
- **429 Too Many Requests** — Rate limit. For production, tune `RATE_LIMIT_MAX`; for load tests, increase temporarily.

Check logs (Compose or Swarm) for the service returning 5xx and address the logged error (DB, Redis, file system, etc.).

---

## 5. Frontend not loading or API unreachable

- **Frontend (port 80)** — Ensure `frontend-dashboard` container is running. Check nginx/config if you use a custom one.
- **API (port 3000)** — Ensure `api-gateway` is running and can reach upload-service and analytics-api. Check gateway logs and env (`UPLOAD_SERVICE_URL`, `ANALYTICS_API_URL`).

If using a reverse proxy (e.g. Nginx) in front, check its config and that it can reach the backend services.

---

## 6. After an outage — checklist

1. **Infra:** Postgres and Redis healthy and reachable.
2. **Health check:** `./infra/health-checks/health-check.sh` — all critical services green.
3. **Workers:** OCR, parser, matcher, export, insights all running; clear backlog if any (scale or wait for drain).
4. **Backups:** Verify latest Postgres (and Redis if used for persistence) backup exists and run a new one if needed.
5. **Monitoring:** If Prometheus/Grafana are used, confirm they are scraping and dashboards show recent data.
6. **Document:** Note root cause and actions in your incident log or runbook for next time.
