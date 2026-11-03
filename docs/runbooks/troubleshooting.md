# Troubleshooting Runbook

Common errors, log locations, and debugging tips for the Resume Intelligence Platform.

---

## 1. Port already in use

**Symptom:** Service fails to start with "address already in use" or "bind: address already in use".

**Find process:**

```bash
# Linux/macOS
lsof -i :3000
lsof -i :5432
lsof -i :6379
```

**Options:**

- Stop the process using the port (e.g. kill the PID), or
- Change the port in:
  - **Compose:** `infra/docker-compose/docker-compose.microservices.yml` (e.g. `"3001:3001"` → `"3011:3001"`).
  - **Env:** Some apps read ports from env (e.g. `PORT`); set in `.env` or stack env.
  - **Swarm:** `infra/swarm/stack.yml` — update `ports` for the affected service.

---

## 2. Database connection errors

**Typical messages:** "connection refused", "ECONNREFUSED", "password authentication failed", "database does not exist".

**Checks:**

1. **Postgres running:**  
   `docker ps | grep postgres` (Compose) or `docker service ps resume-platform_postgres` (Swarm). Start stack or start Postgres first.

2. **Host/port from app:**  
   Apps use `POSTGRES_HOST`, `POSTGRES_PORT`. From host: `localhost` and `5432`. From another container on same Docker network: service name `postgres` and `5432`.

3. **Credentials:**  
   `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` must match Postgres env (e.g. in Compose: `POSTGRES_USER=postgres`, `POSTGRES_DB=resume_platform`). Check `.env` and Compose/Swarm env.

4. **DB exists:**  
   Init script `infra/postgres/init.sql` creates `resume_platform`. If you use a custom DB name, ensure it exists and apps use the same name.

5. **Migrations:**  
   Run `./scripts/migrate-db.sh` after first start or after schema changes.

---

## 3. Redis connection errors

**Typical messages:** "Redis connection failed", "ECONNREFUSED", "NOAUTH" (when password required).

**Checks:**

1. **Redis running:**  
   `docker ps | grep redis` or `docker service ps resume-platform_redis`.

2. **Host/port:**  
   `REDIS_HOST`, `REDIS_PORT`. From host: `localhost`, `6379`. From container: `redis`, `6379`.

3. **Password:**  
   If Redis has `requirepass`, set `REDIS_PASSWORD` in app env. Compose default often has no password.

4. **Connect manually:**  
   `redis-cli -h localhost -p 6379 ping` (from host). From container: use service name as host.

---

## 4. Queue jobs not running (workers not consuming)

**Symptom:** Uploads succeed but resumes stay in "pending" or "processing"; queues grow.

**Checks:**

1. **Workers running:**  
   `docker-compose ps ocr-worker parser-worker matcher-worker` or `docker service ps resume-platform_ocr-worker resume-platform_parser-worker resume-platform_matcher-worker`.

2. **Redis reachable by workers:**  
   Same network as Redis; correct `REDIS_HOST`/`REDIS_PORT` (e.g. `redis` in Docker).

3. **Worker logs:**  
   Look for connection errors, uncaught exceptions, or repeated job failures:

   ```bash
   docker-compose logs -f ocr-worker parser-worker
   docker service logs -f resume-platform_parser-worker
   ```

4. **OCR/parser queue names:**  
   Upload service and Python workers must use the same Redis list names: `ocr-queue`, `parser-queue` (see `apps/upload-service-node`, `apps/ocr-worker-python`, `apps/parser-worker-python`).

5. **File path in OCR job:**  
   OCR worker needs the file at the path stored in the job. With Docker volumes, path must be the same inside the upload-service and ocr-worker containers (e.g. `/app/uploads/...`). Check volume mounts in Compose/Swarm.

---

## 5. Upload fails (4xx / 5xx)

- **400 Bad Request:** Invalid file type or size. Check upload-service validators and limits (e.g. max file size, allowed MIME types).
- **413 Payload Too Large:** Nginx or app body size limit. Increase `client_max_body_size` (Nginx) or upload limit in upload-service.
- **500 Internal Server Error:** Check upload-service logs (DB insert, queue push, disk write). Often DB or Redis.

---

## 6. Gateway 502 / 503 to upload or analytics

**Cause:** API Gateway proxies to upload-service or analytics-api; one of them is down or unreachable.

**Checks:**

1. Upload service and analytics-api are running and healthy:  
   `curl -s http://localhost:3001/health` and `curl -s http://localhost:3002/health`.

2. Gateway env:  
   `UPLOAD_SERVICE_URL`, `ANALYTICS_API_URL` must be reachable from the gateway container. In Compose/Swarm use service names: `http://upload-service:3001`, `http://analytics-api:3002`.

3. Network:  
   All app services on the same Docker network (e.g. `resume-platform`).

---

## 7. Where to find logs

| Environment             | Command                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| Compose (all)           | `docker-compose -f infra/docker-compose/docker-compose.microservices.yml logs -f`                |
| Compose (one service)   | `docker-compose -f infra/docker-compose/docker-compose.microservices.yml logs -f upload-service` |
| Swarm (one service)     | `docker service logs -f resume-platform_upload-service-node`                                     |
| Swarm (all)             | Loop over `docker stack services resume-platform` and run `docker service logs` for each         |
| Kubernetes (all pods)   | `kubectl logs -l app.kubernetes.io/part-of=resume-intelligence-platform -n resume-platform -f`   |
| Kubernetes (by service) | `kubectl logs -l app.kubernetes.io/name=upload-service -n resume-platform -f --tail=100`         |
| Kubernetes (single pod) | `kubectl logs <pod-name> -n resume-platform -f`                                                  |

Increase `--tail` if needed (e.g. `--tail=500`). For structured logs, grep for "error" or "ERROR".

---

## 8. Build or image errors

- **"Cannot find module" / TS errors in build:** Run `pnpm install` at repo root and `pnpm build` (or build the specific app). Ensure Node version matches (e.g. 18+).
- **Docker build fails:** Build context and Dockerfile path matter. Compose uses `context: ../..` and `dockerfile: apps/upload-service-node/Dockerfile`. Run from repo root.
- **Python worker build:** Ensure `Dockerfile` and `requirements.txt` are correct; base image has required system libs (e.g. Tesseract for OCR).

---

## 9. Load test failures (e.g. 429 or high failure rate)

- **429:** Gateway rate limit. Increase `RATE_LIMIT_MAX` (or equivalent) for the test or for the environment.
- **High failure rate:** Run smoke test first: `pnpm run load-test:smoke`. Ensure stack is up, gateway URL correct (`BASE_URL`), and if k6 runs in Docker, use `host.docker.internal` for host-side gateway (scripts/run-k6.sh may do this). See `load-testing/README.md`.

---

## 10. Useful one-liners

```bash
# All app containers (Compose)
docker-compose -f infra/docker-compose/docker-compose.microservices.yml ps

# Resource usage
docker stats

# Redis queue lengths
redis-cli LLEN ocr-queue
redis-cli LLEN parser-queue

# Postgres connect (replace container name)
docker exec -it $(docker ps -qf 'name=postgres') psql -U postgres -d resume_platform -c '\dt'

# Follow upload-service logs
docker-compose -f infra/docker-compose/docker-compose.microservices.yml logs -f upload-service
```

---

## 11. Kubernetes Troubleshooting

### Pods in `CrashLoopBackOff` or `Error`

1. Check the previous container termination logs:
   ```bash
   kubectl logs <pod-name> -n resume-platform --previous
   ```
2. Inspect lifecycle events and exit code:
   ```bash
   kubectl describe pod <pod-name> -n resume-platform
   ```
3. Common reasons:
   - Missing environment variables in `platform-config` or `platform-secrets`.
   - PostgreSQL or Redis not yet ready (check `kubectl get statefulset -n resume-platform`).

### Pods in `ImagePullBackOff` or `ErrImagePull`

1. If testing locally (Minikube / Kind), images must either be built in the cluster or loaded into the node:

   ```bash
   # Minikube:
   eval $(minikube docker-env)
   ./scripts/build-all-services.sh
   # Or:
   minikube image load api-gateway-node:latest

   # Kind:
   kind load docker-image api-gateway-node:latest --name <cluster-name>
   ```

2. In remote production clusters: verify image registry path in `values.yaml` or `overlays/prod/kustomization.yaml` and verify `imagePullSecrets`.

### Pods in `Pending` / PersistentVolumeClaim `FailedBinding`

1. Inspect PVC status:
   ```bash
   kubectl get pvc -n resume-platform
   kubectl describe pvc uploads-data-pvc -n resume-platform
   ```
2. If using a single-node cluster (Minikube / Docker Desktop / Kind):
   Ensure `dev` profile is used (`pnpm k8s:start:dev` or `pnpm helm:install:dev`), which uses `ReadWriteOnce` access mode.
3. In multi-node production clusters: ensure your storage provisioner supports `ReadWriteMany` (e.g. AWS EFS CSI, GCP Filestore, Azure Files, Longhorn, or NFS).

### Ingress Returning `502 Bad Gateway` / `504 Gateway Timeout`

1. Verify `api-gateway` and `frontend-dashboard` pods are running and ready:
   ```bash
   kubectl get endpoints -n resume-platform
   ```
   If endpoints list is `<none>`, the readiness probe is failing.
2. Check Ingress controller access logs:
   ```bash
   kubectl logs -n ingress-nginx -l app.kubernetes.io/name=ingress-nginx --tail=100 -f
   ```
3. If uploading large resumes (>10MB):
   Verify `nginx.ingress.kubernetes.io/proxy-body-size: "50m"` and proxy timeouts in `infra/k8s/base/ingress/ingress.yaml`.

### Direct Port-Forwarding for Isolated Debugging

Bypass Ingress to test individual microservices directly:

```bash
# API Gateway:
kubectl port-forward svc/api-gateway 3000:3000 -n resume-platform

# Frontend UI:
kubectl port-forward svc/frontend-dashboard 8080:80 -n resume-platform

# PostgreSQL DB:
kubectl port-forward svc/postgres 5432:5432 -n resume-platform

# Redis Cache:
kubectl port-forward svc/redis 6379:6379 -n resume-platform
```

For more on recovery and operations, see [Operations](operations.md) and [Incident response](incident-response.md).
