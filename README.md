# Resume Intelligence Platform

An automated, scalable resume analytics platform that processes resumes, extracts key information, matches candidates to job roles, and provides actionable insights on it.

## Features

- **Multi-format upload** — PDF, DOCX, and image formats
- **OCR processing** — Text extraction from scanned documents (Tesseract)
- **NLP extraction** — Skills, experience, education, contact info
- **Role matching** — Resume-to-job matching with scoring
- **Analytics dashboard** — Skills, experience, education, match insights
- **CSV export** — Export parsed resume data
- **Scalable architecture** — Queue-based microservices, Docker Swarm, and Kubernetes
- **Production Kubernetes** — Helm 3 chart, Kustomize overlays, Ingress (`least_conn`/`ewma`), HPA, zero-trust network policies
- **Load testing** — k6 for capacity planning

## System design

High-level architecture of the Resume Intelligence Platform:

![Resume Intelligence Platform System Design](docs/system-design/Resume_Inteligence_Platform_System_Design.png)

Resume processing job flow (upload → OCR → parser → matcher → dashboard and export):

![Resume Processing Job Flow](docs/system-design/Resume_Processing_Job_Flow.png)

**Detailed documentation:**

- **[Architecture](docs/architecture/README.md)** — Components, data flow, queues, deployment
- **[Runbooks](docs/runbooks/README.md)** — Operations, incident response, troubleshooting

---

## UI Screenshots

| Upload                                                                             | Resumes                                                                              |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| ![Upload](docs/screenshots/upload/Screenshot%202026-02-02%20at%202.49.20%20PM.png) | ![Resumes](docs/screenshots/resumes/Screenshot%202026-02-02%20at%202.46.30%20PM.png) |

| Resumes (detail)                                                                            | Jobs                                                                           |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| ![Resumes detail](docs/screenshots/resumes/Screenshot%202026-02-02%20at%203.25.56%20PM.png) | ![Jobs](docs/screenshots/jobs/Screenshot%202026-02-02%20at%202.47.44%20PM.png) |

| Analytics                                                                                |
| ---------------------------------------------------------------------------------------- |
| ![Analytics](docs/screenshots/analytics/Screenshot%202026-02-02%20at%202.47.12%20PM.png) |

_More screenshots: [docs/screenshots](docs/screenshots/README.md)_

---

## Tech Stack

| Layer      | Technology                                                          |
| ---------- | ------------------------------------------------------------------- |
| Frontend   | React, TypeScript, Vite, Tailwind, ApexCharts                       |
| API        | Node.js, TypeScript, Fastify                                        |
| Queue      | BullMQ (Redis)                                                      |
| OCR        | Tesseract (Python)                                                  |
| Parser/NLP | Python (SpaCy) / Node.js                                            |
| Database   | PostgreSQL                                                          |
| Monorepo   | Turborepo, pnpm                                                     |
| Deployment | Docker, Docker Compose, Docker Swarm, Kubernetes (Helm & Kustomize) |

---

## Security (API servers)

All Node.js APIs (API Gateway, Upload Service, Analytics API) use industry-standard security:

- **Helmet** — HTTP security headers: HSTS, X-Content-Type-Options (noSniff), X-Frame-Options, Referrer-Policy, Cross-Origin-Resource-Policy, permitted cross-domain policies, etc.
- **Rate limiting** — Per-IP limits (configurable via `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW`). Gateway default: 10000/15min; Upload: 500/15min; Analytics: 1000/15min.
- **CORS** — Allowed methods and headers restricted. Set `CORS_ORIGINS` (comma-separated) to an explicit allow-list in production, or `false` if the API is only used same-origin; credentials are only ever allowed together with an explicit list. A warning is logged at startup in production if it is unset.
- **Request correlation** — Every request carries an `x-request-id`. nginx sets it at the edge, the gateway adopts it (a malformed or client-forged value is replaced), forwards it to the upstream service, and returns it on every response (including 404/429/5xx). Each service's access log line includes it as `reqId`, so one id follows a request through all logs. Query strings are never logged (they can contain search terms / personal data).
- **Client identity behind proxies** — `request.ip` (and therefore per-IP rate limiting) only reflects the real client if the service is told how many proxies sit in front of it via `TRUST_PROXY`: `1` (one hop, e.g. nginx → gateway, or gateway → upstream service), `true` (trust every hop), a CIDR list, or unset/`false` (default: don't trust `X-Forwarded-For`). The gateway always sends the resolved client IP to upstreams. **Set `TRUST_PROXY=1` on the gateway and on the upload/analytics services when they are only reachable through their proxy; leave it unset on any service whose port is published directly**, otherwise clients can choose their own rate-limit identity. Without it, upstream rate limits count every user as the gateway's single address.
- **Upstream failures** — The gateway applies a per-route timeout and answers `504` (timeout), `503` (upstream down) or `502` (connection dropped) with `{ success: false, error, requestId }`, never the raw upstream error.

Tune limits per environment (e.g. higher for load tests, lower for public APIs).

---

## Project Structure

```
resume-intelligence-platform/
├── apps/                          # Deployable applications
│   ├── api-gateway-node/          # API gateway (entry point, proxies)
│   ├── upload-service-node/       # File upload, queue OCR/parser jobs
│   ├── analytics-api-node/       # Dashboard, jobs, resumes, export APIs
│   ├── matcher-worker-node/       # BullMQ worker: resume–job matching
│   ├── export-worker-node/       # BullMQ worker: CSV export
│   ├── ocr-worker-python/        # OCR text extraction (Redis list)
│   ├── parser-worker-python/     # Resume parsing (Redis list)
│   ├── insights-worker-python/  # Insights aggregation (Redis list)
│   └── frontend-dashboard/       # React SPA
├── packages/                     # Shared libraries
│   ├── config/                   # Shared config (env, ports)
│   ├── logger/                   # Shared logger
│   ├── http-kit/                 # Shared Fastify setup: request ids, access log, security defaults
│   ├── queue-lib/                # BullMQ producers/consumers
│   ├── resume-nlp/               # NLP utilities (Node)
│   └── role-matching/            # Matching/scoring logic
├── infra/                        # Infrastructure config (see infra/README.md)
│   ├── k8s/                      # Kubernetes manifests, Helm chart, Ingress & LB
│   ├── docker-compose/           # Compose files (dev, prod, microservices)
│   ├── swarm/                    # Docker Swarm stack
│   ├── ansible/                  # Server provisioning
│   ├── backup/                   # Backup scripts (Postgres, Redis)
│   ├── docker/                   # Monitoring stack (Prometheus, Grafana, Loki)
│   ├── health-checks/            # Health check script
│   ├── monitoring/               # Prometheus, Grafana, Alertmanager
│   └── postgres/                 # Init SQL and migrations
├── docs/                         # Documentation
│   ├── architecture/             # Architecture (components, data flow, queues)
│   ├── runbooks/                 # Operations, incident response, troubleshooting
│   ├── screenshots/              # UI screenshots (upload, resumes, jobs, analytics, flows)
│   └── system-design/            # System design + processing flow diagrams
├── scripts/                      # Build, deploy, seed, migrate, stop-swarm
├── load-testing/                 # k6 configs
├── package.json                  # Root scripts, turbo
├── pnpm-workspace.yaml
└── turbo.json
```

---

## Prerequisites

- **Node.js** 24+ (matches `.nvmrc` and the service Docker images)
- **pnpm** 8+ — `npm install -g pnpm`
- **Docker** and **Docker Compose**
- **kubectl** and **Helm 3+** (for Kubernetes deployment)
- **Python 3.9+** (optional, for local parser/OCR development)

---

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd resume-intelligence-platform
pnpm install
```

### 2. Environment

```bash
cp .env.example .env
# Edit .env (DB, Redis, ports, etc.)
```

### 3. Build

```bash
pnpm build
```

---

## Startup

### Option A: Docker Compose (all microservices)

Start everything (PostgreSQL, Redis, gateway, APIs, workers, frontend):

```bash
# Use existing images
pnpm run docker:microservices

# Or build images then start
pnpm run docker:start:build

# Or use the script (with status/output)
pnpm run docker:start
./scripts/start-all-services.sh --build

# Full stack with monitoring (Prometheus, Grafana, Loki)
pnpm run docker:start:full
```

Direct Compose:

```bash
docker-compose -f infra/docker-compose/docker-compose.microservices.yml up -d
```

### Option B: Local development (infra in Docker)

1. Start only PostgreSQL and Redis:

```bash
pnpm run docker:dev
# Or: docker-compose -f infra/docker-compose/docker-compose.dev.yml up
```

2. Run apps locally (separate terminals):

```bash
pnpm --filter @resume-platform/api-gateway dev
pnpm --filter @resume-platform/upload-service dev
pnpm --filter @resume-platform/analytics-api dev
pnpm --filter @resume-platform/frontend-dashboard dev
# Workers: matcher-worker-node, ocr-worker-python, parser-worker-python, etc.
```

### Option C: Docker Swarm (production-style)

```bash
docker swarm init
pnpm run swarm:deploy
# Check: docker stack services resume-platform
```

Stop Swarm stack:

```bash
pnpm run swarm:stop
# Or: bash scripts/stop-swarm.sh
```

### Option D: Kubernetes (Production & Local)

The platform provides a production-grade Kubernetes architecture with multi-tier load balancing (`least_conn`/`ewma`), autoscaling (HPA v2), zero-downtime rolling updates, and network policies under `infra/k8s/`.

#### 1. Deploy with Helm (Recommended)

```bash
# Local development (1 replica, RWO storage, NodePort):
pnpm helm:install:dev

# Production deployment (multi-replica, RWX storage, Ingress, TLS):
pnpm helm:install:prod

# Upgrade after code/config updates:
pnpm helm:upgrade

# Uninstall:
pnpm helm:uninstall
```

#### 2. Deploy with Kustomize (`kubectl`)

```bash
# Local development (Minikube / Kind / Docker Desktop):
pnpm k8s:start:dev

# Production cluster:
pnpm k8s:start:prod

# Teardown:
pnpm k8s:stop
```

#### 3. Manage & Verify

```bash
# Check status of pods, services, ingress, and autoscalers:
pnpm k8s:status

# Verify / re-apply database schema and seed data in K8s:
pnpm k8s:init-db
```

For complete details on Ingress routing, edge proxies, shared storage (RWX), and zero-trust policies, see the **[Kubernetes Guide](infra/k8s/README.md)**.

---

## Access

**Application (microservices stack):**

| Service                  | URL                                                                   |
| ------------------------ | --------------------------------------------------------------------- |
| Frontend                 | http://localhost:80 (Compose) or :8080 (local dev)                    |
| API Gateway              | http://localhost:3000                                                 |
| Upload Service           | http://localhost:3001                                                 |
| Analytics API            | http://localhost:3002                                                 |
| PostgreSQL               | localhost:5432                                                        |
| Redis                    | localhost:6379                                                        |
| **Kubernetes (Ingress)** | http://<ingress-host>/ (Frontend) and http://<ingress-host>/api (API) |
| **Kubernetes (Edge LB)** | http://<loadbalancer-ip>:80 (or NodePort 30080 in dev)                |

**Monitoring (only when using `docker:start:full` or after `infra:start`):**

| Service      | URL                                 |
| ------------ | ----------------------------------- |
| Prometheus   | http://localhost:9090               |
| Grafana      | http://localhost:3030 (admin/admin) |
| Alertmanager | http://localhost:9093               |

Health: `curl http://localhost:3000/health`

**API docs (Swagger UI):** each HTTP service serves Swagger UI at `/docs` and its OpenAPI 3 spec at `/docs/json`.

| Docs                   | URL                        | Notes                                                                                |
| ---------------------- | -------------------------- | ------------------------------------------------------------------------------------ |
| API Gateway (all APIs) | http://localhost:3000/docs | Use "Select a definition" to browse upload and analytics APIs with **gateway** paths |
| Upload Service         | http://localhost:3001/docs | Includes internal endpoints not exposed through the gateway                          |
| Analytics API          | http://localhost:3002/docs |                                                                                      |

Set `API_DOCS_ENABLED=false` to turn the docs off. Route schemas are documentation only: they do not validate requests or reshape responses.

---

## Testing

| Command              | What it runs                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------- |
| `pnpm test`          | Every workspace's Vitest suite through Turbo (no build needed; packages resolve to `src`) |
| `pnpm test:unit`     | All Node packages, services and the frontend in a single Vitest run                       |
| `pnpm test:coverage` | Same as `test:unit` with a combined coverage report in `coverage/`                        |
| `pnpm test:python`   | pytest for the OCR, parser and insights workers (uses `$PYTHON`, default `python3`)       |

Per package: `pnpm --filter @resume-platform/<name> test` (or `test:watch`, `test:coverage`). Tests live next to the code as `*.test.ts(x)`; Python tests are in each worker's `tests/`.

Python setup (once, in a virtualenv):

```bash
for w in ocr parser insights; do pip install -r apps/$w-worker-python/requirements-dev.txt; done
pnpm test:python
```

### Lint and CI

`pnpm lint` lints every workspace with ESLint (`eslint.config.mjs`) and **fails on any warning** (`--max-warnings 0`); `pnpm lint:fix` applies auto-fixes. Unused code should be deleted rather than silenced, and `catch` bindings are `unknown` (use `getErrorMessage` from each service's `utils/errors.ts`).

GitHub Actions (`.github/workflows/ci.yml`) runs on every pull request and on pushes to `main` / `Development`:

| Job      | What it does                                                                                             |
| -------- | -------------------------------------------------------------------------------------------------------- |
| `node`   | On Node 22 and 24 (matches `.nvmrc` and the images): `pnpm lint`, `build`, `type-check`, `test:coverage` |
| `python` | One job per worker on Python 3.11: `pytest` with coverage (fails under 90%)                              |
| `docker` | After the above pass, builds every service image without pushing, to catch Dockerfile/lockfile breakage  |

Coverage floors are enforced (Node: 90% lines/statements/functions, 85% branches in `vitest.config.mts`; Python: 90%). To reproduce CI locally: `pnpm install --frozen-lockfile && pnpm lint && pnpm build && pnpm type-check && pnpm test:coverage`.

Known bugs are captured as expected failures (`it.fails` in Vitest, `xfail(strict=True)` in pytest) with a `BUG:` note; they start failing loudly once fixed, so the marker can be removed.

---

## Start scripts compared

| Script                                                         | What it does                                                                                                                                                                      |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`pnpm run docker:start`**                                    | Start microservices with **existing** images (no build). Uses `start-all-services.sh`.                                                                                            |
| **`pnpm run docker:start:build`**                              | **Build** images, then start **microservices only** (gateway, upload, analytics, workers, frontend, Postgres, Redis). No Prometheus/Grafana.                                      |
| **`pnpm run docker:start:full`**                               | **Build** images, start **microservices**, then start **monitoring stack** (Prometheus, Grafana, Loki, Promtail, Alertmanager). Use this to get Grafana at http://localhost:3030. |
| **`pnpm run docker:microservices`**                            | Start microservices with existing images (Compose only, no script).                                                                                                               |
| **`pnpm run swarm:deploy`** / **`pnpm run swarm:start:build`** | Deploy the **same apps** as **Docker Swarm** (production-style, replicas, single published port). No monitoring stack unless you add it separately.                               |
| **`pnpm run swarm:start`**                                     | Deploy Swarm stack **without** rebuilding images.                                                                                                                                 |

**Summary:** Use **`docker:start:build`** for app-only; use **`docker:start:full`** for app + Grafana/Prometheus; use **Swarm** scripts for production-style scaling.

---

## Scripts (root)

| Script                      | Description                                        |
| --------------------------- | -------------------------------------------------- |
| `pnpm build`                | Build all packages/apps                            |
| `pnpm dev`                  | Run all apps in dev                                |
| `pnpm lint`                 | Lint                                               |
| `pnpm type-check`           | TypeScript check                                   |
| `pnpm docker:dev`           | Start dev Compose (Postgres, Redis only)           |
| `pnpm docker:microservices` | Start microservices stack (existing images)        |
| `pnpm docker:start`         | Start microservices (no build) via script          |
| `pnpm docker:start:build`   | Build images + start microservices only            |
| `pnpm docker:start:full`    | Build + microservices + monitoring (Grafana, etc.) |
| `pnpm docker:down`          | Stop microservices + monitoring (Grafana, etc.)    |
| `pnpm docker:logs`          | Follow logs                                        |
| `pnpm infra:start`          | Start monitoring stack (run after microservices)   |
| `pnpm infra:stop`           | Stop monitoring stack                              |
| `pnpm seed:jobs`            | Seed job roles (bash scripts/seed-jobs.sh)         |
| `pnpm swarm:deploy`         | Deploy Swarm stack                                 |
| `pnpm swarm:start`          | Deploy Swarm (no rebuild)                          |
| `pnpm swarm:start:build`    | Build + deploy Swarm                               |
| `pnpm swarm:stop`           | Remove Swarm stack                                 |
| `pnpm load-test`            | Run k6 upload test                                 |

---

## Commit conventions

The repo uses **Husky**, **lint-staged**, and **Commitlint** with [Conventional Commits](https://www.conventionalcommits.org/):

- **pre-commit:** Runs **lint-staged** — ESLint (fix) and Prettier on staged `.ts`, `.tsx`, `.js`, `.json`, `.md`, `.yml` files.
- **commit-msg:** Runs **Commitlint** — enforces conventional commit format.

**Commit format:** `type(scope?): subject` (e.g. `feat(upload): add batch upload`, `fix(parser): handle empty PDF`). Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. Header max 100 characters.

After `pnpm install`, the `prepare` script installs Husky hooks automatically.

---

## Database and data

- **Migrations:** `./scripts/migrate-db.sh`
- **Backup:** `pnpm infra:backup:postgres` or `./infra/backup/scripts/backup-postgres.sh`
- **Seed jobs:** `pnpm run seed:jobs` (or `bash scripts/seed-jobs.sh`)

---

## Troubleshooting

- **Port in use:** Change port in Compose or stop the process using the port (e.g. `lsof -i :3000`).
- **Services not starting:** Check `docker-compose ... logs` and ensure PostgreSQL/Redis are up first.
- **Queue jobs not running:** Verify Redis is running and worker containers (matcher, ocr, parser) are up.
- **DB connection errors:** Confirm `.env` and that Postgres is ready before starting app services.

---

## License

MIT
