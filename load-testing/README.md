# Load Testing & Capacity

Load tests help find **upload capacity** (requests/sec, p95 latency) so you can size **Docker Swarm upload-service replicas** and scale the upload pool.

## Prerequisites

- **k6**: Not required on your machine. The npm scripts (`pnpm run load-test`, etc.) use `scripts/run-k6.sh`, which runs k6 via **Docker** (grafana/k6) if k6 is not in your PATH. Alternatively, [install k6](https://k6.io/docs/get-started/installation/) (e.g. `brew install k6`) for faster local runs.
- **Docker**: Required to run load tests if k6 is not installed.
- Stack running (local or Swarm). For gateway on host use default `BASE_URL=http://localhost:3000`; the script maps this to `host.docker.internal` when using Docker.

## Running Tests

**Using Docker Compose** (e.g. `pnpm run docker:start` or `pnpm run docker:start:build`): the API gateway is on host port **3000**. The default `BASE_URL=http://localhost:3000` is correct. If k6 runs via Docker, the script rewrites this to `host.docker.internal:3000` so the k6 container can reach the gateway.

### 1. Single-file upload (baseline, 100 VUs)

Default load ramps to **100 VUs**. To handle that load with high success:

**Option A – Docker Swarm (recommended for scaled load)**  
Swarm runs multiple replicas with one published port; the routing mesh load-balances.

1. **Start the stack with Swarm** (upload-service=3, api-gateway=2, analytics-api=2):

   ```bash
   pnpm run swarm:start:build
   ```

   Or redeploy without rebuilding: `pnpm run swarm:start`

2. **Run the load test:**
   ```bash
   pnpm run load-test
   ```

**Option B – Docker Compose (scaled)**

1. Start: `pnpm run docker:start:scale:build` (or `pnpm run docker:start:scale` after first build).
2. Run: `pnpm run load-test`

**Option C – Kubernetes (HPA & Ingress Load Balancing)**  
When running against Kubernetes, k6 can target the Ingress or Edge Load Balancer directly while watching HPA dynamically scale replicas:

```bash
# 1. Target the K8s Ingress or Edge Proxy URL:
BASE_URL=http://localhost:3000 pnpm run load-test

# 2. In a separate terminal, watch HPA autoscaling in real time:
kubectl get hpa -w -n resume-platform
```

Light load: `pnpm run load-test:smoke`. Stress (same 100 VU): `pnpm run load-test:stress`.

### 2. Capacity test (find max RPS)

Ramps VUs to 100 and holds; use output to see **sustainable RPS** and **p95** before errors rise.

```bash
BASE_URL=http://localhost:3000 pnpm exec k6 run load-testing/k6/upload-capacity.test.js
```

From the summary:

- **http_reqs** → requests per second (RPS) at peak
- **http_req_duration p(95)** → latency; if this exceeds threshold, add replicas or tune `UPLOAD_MAX_CONCURRENT`
- **http_req_failed** → error rate; keep &lt; 5–10%

### 3. Batch upload (multiple files per request)

```bash
BASE_URL=http://localhost:3000 FILES_PER_REQUEST=5 pnpm exec k6 run load-testing/k6/upload-batch.test.js
```

## Interpreting Results

| Metric                | Use                                                                         |
| --------------------- | --------------------------------------------------------------------------- |
| **RPS at target p95** | Sustainable throughput (e.g. 50 RPS at p95 &lt; 3s).                        |
| **Error rate**        | Keep &lt; 5%; if higher, reduce load or add replicas.                       |
| **p95 latency**       | If &gt; 5s, scale replicas or increase `UPLOAD_MAX_CONCURRENT` per replica. |

**429 Too Many Requests:** The API gateway rate-limits by IP. The default is 10000 requests per 15 minutes so load tests don't hit 429. If you see 429, set `RATE_LIMIT_MAX=100000` (or higher) when starting the gateway, or restart the stack with that env.

**If you see very high failure rate (e.g. 99%):** Run the smoke test first: `pnpm run load-test:smoke`. If you get 429, the gateway rate limit was too low (now default 10000). Load tests no longer fail the process on threshold breach; the run exits 0 and you get the full report.

## Sizing upload-service replicas

1. Run **capacity test** against current replica count (e.g. 3).
2. Note **max RPS** where error rate stays &lt; 5% and p95 &lt; 5s → call this **RPS_per_replica** (approximate).
3. Choose **target_RPS** (e.g. 200 uploads/sec).
4. **Replicas** ≈ `target_RPS / RPS_per_replica` (round up).

Example: capacity test gives ~40 RPS per replica at 3 replicas → RPS_per_replica ≈ 40. For 200 RPS → 200/40 = 5 replicas.

## Scaling the upload pool (Docker Swarm)

After sizing:

```bash
# Scale to 5 upload-service replicas (stack name: resume-platform)
./scripts/scale-upload.sh 5

# Or manually
docker service scale resume-platform_upload-service-node=5
```

Check status:

```bash
docker service ps resume-platform_upload-service-node
docker service ls
```

## Capacity tuning (per replica)

Env vars (see `.env.swarm` and `infra/swarm/stack.yml`):

| Variable                | Meaning                                           | Suggested      |
| ----------------------- | ------------------------------------------------- | -------------- |
| `DB_POOL_MAX`           | Max DB connections per upload-service replica     | 20             |
| `UPLOAD_MAX_CONCURRENT` | Max concurrent uploads per replica (0 = no limit) | 50 under burst |

Set before deploy or override in stack env. More replicas = more total capacity; `UPLOAD_MAX_CONCURRENT` caps concurrency per process to avoid OOM under burst.
