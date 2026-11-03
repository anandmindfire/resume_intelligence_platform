# Architecture

This folder describes the architecture of the Resume Intelligence Platform: components, data flow, queues, and deployment.

## Overview

The platform is a **queue-based microservices** system that:

1. Accepts resume uploads (PDF, DOCX, images) via an API gateway and upload service.
2. Runs **OCR** (Tesseract) on documents that need text extraction.
3. Runs **NLP parsing** (Python/SpaCy) to extract skills, experience, education, contact info.
4. **Matches** resumes to job roles and computes scores (BullMQ worker).
5. **Exports** resume data to CSV on demand (BullMQ worker).
6. **Aggregates insights** for the analytics dashboard (Python worker).
7. Serves a **React frontend** and REST APIs for jobs, resumes, and analytics.

All application services are containerized (Docker) and can run via **Docker Compose** (dev/staging) or **Docker Swarm** (production-style scaling).

---

## High-level diagram

See the system design diagrams in the repo:

- [Resume Intelligence Platform — system design](../system-design/Resume_Inteligence_Platform_System_Design.png) — high-level architecture.
- [Resume processing job flow](../system-design/Resume_Processing_Job_Flow.png) — sequence: upload → OCR → parser → matcher → dashboard and export.

---

## Components

### Entry and APIs

| Component          | Role                                                            | Port (default)            | Tech                  |
| ------------------ | --------------------------------------------------------------- | ------------------------- | --------------------- |
| **API Gateway**    | Single entry point; proxies to upload-service and analytics-api | 3000                      | Node.js, Fastify      |
| **Upload Service** | File upload, validation, enqueue OCR → parser → matcher         | 3001                      | Node.js, Fastify      |
| **Analytics API**  | Dashboard APIs: jobs, resumes, analytics, export triggers       | 3002                      | Node.js, Fastify      |
| **Frontend**       | React SPA (resumes, jobs, upload, analytics)                    | 80 (Compose) / 8080 (dev) | React, Vite, Tailwind |

### Workers (async)

| Worker              | Role                                                       | Queue(s)                             | Tech          |
| ------------------- | ---------------------------------------------------------- | ------------------------------------ | ------------- |
| **OCR Worker**      | Extract text from PDF/images (Tesseract)                   | Consumes `ocr-queue` (Redis list)    | Python        |
| **Parser Worker**   | Parse extracted text (skills, experience, education, etc.) | Consumes `parser-queue` (Redis list) | Python, SpaCy |
| **Matcher Worker**  | Score resume–job match                                     | BullMQ `matcher-queue`               | Node.js       |
| **Export Worker**   | Generate CSV export                                        | BullMQ `export-queue`                | Node.js       |
| **Insights Worker** | Aggregate data for analytics                               | Redis list / internal                | Python        |

### Data stores

| Store          | Role                                                                |
| -------------- | ------------------------------------------------------------------- |
| **PostgreSQL** | Resumes, jobs, parsed data, match scores, users (if any).           |
| **Redis**      | Queues (BullMQ + Redis lists for Python workers), optional caching. |

### Infrastructure (optional)

| Component           | Role                      |
| ------------------- | ------------------------- |
| **Prometheus**      | Metrics (e.g. 9090).      |
| **Grafana**         | Dashboards (e.g. 3030).   |
| **Loki / Promtail** | Log aggregation.          |
| **Alertmanager**    | Alert routing.            |
| **Nginx**           | Reverse proxy (optional). |

---

## Data flow

### Resume processing pipeline

1. **Upload**  
   Client → API Gateway → Upload Service. File is stored (e.g. volume `uploads`), record created in DB, status e.g. `pending`.

2. **OCR**  
   Upload service pushes a job to **`ocr-queue`** (Redis list). OCR worker (Python) picks it up, runs Tesseract, pushes result to **`parser-queue`**.

3. **Parsing**  
   Parser worker (Python) reads from **`parser-queue`**, extracts entities (skills, experience, education, contact), writes to DB, updates status to `parsed` (or `failed`). On success, it triggers the matcher (e.g. HTTP call to upload-service or push to **matcher-queue**).

4. **Matching**  
   Matcher worker (Node, BullMQ) processes **`matcher-queue`**, computes resume–job scores, persists to DB.

5. **Export**  
   User requests export → Analytics API enqueues **`export-queue`** → Export worker generates CSV and stores in `exports` volume; user downloads via API.

6. **Insights**  
   Insights worker aggregates data for the analytics dashboard (e.g. skills distribution, experience bands).

### Queue summary

| Queue                       | Producer                       | Consumer               | Payload                                |
| --------------------------- | ------------------------------ | ---------------------- | -------------------------------------- |
| `ocr-queue` (Redis list)    | Upload Service                 | OCR Worker (Python)    | resumeId, filePath, fileName, mimeType |
| `parser-queue` (Redis list) | Upload Service (or OCR Worker) | Parser Worker (Python) | resumeId, extractedText                |
| `matcher-queue` (BullMQ)    | Upload Service / Parser        | Matcher Worker (Node)  | resumeId                               |
| `export-queue` (BullMQ)     | Analytics API                  | Export Worker (Node)   | export request params                  |

---

## Deployment

### Docker Compose

- **Full stack:** `infra/docker-compose/docker-compose.microservices.yml` — gateway, upload, analytics, all workers, frontend, Postgres, Redis.
- **Dev:** `docker-compose.dev.yml` — Postgres + Redis only; run apps locally.
- **Scaled:** `docker-compose.scale.yml` — override for more upload-service replicas.

Commands (from repo root):

```bash
pnpm run docker:microservices   # full stack
pnpm run docker:dev             # infra only
pnpm run docker:start:scale     # scaled upload
```

### Docker Swarm

- **Stack:** `infra/swarm/stack.yml` — same services with `deploy.replicas` (e.g. upload-service, api-gateway, analytics-api, matcher-worker, parser-worker).
- **Deploy:** `pnpm run swarm:deploy` or `./scripts/deploy-swarm.sh`.
- **Scale upload:** `./scripts/scale-upload.sh 5`.

### Kubernetes (Production Architecture)

- **Manifests & Overlays:** `infra/k8s/base/`, `infra/k8s/overlays/dev/`, `infra/k8s/overlays/prod/`
- **Helm Chart:** `infra/k8s/helm/resume-platform/`
- **Deploy via Helm:** `pnpm helm:install:prod` (or `:dev`)
- **Deploy via Kustomize:** `pnpm k8s:start:prod` (or `:dev`)

#### Kubernetes Load Balancing & Traffic Topology

```
                      Client / Browser
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
     [ NGINX Ingress ]             [ In-Cluster Edge LB ]
     (ewma load balancing)       (least_conn Load Balancer)
     /api/*            /*          /api/*            /*
       │               │             │               │
       ▼               ▼             ▼               ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ api-gateway │ │  frontend   │ │ api-gateway │ │  frontend   │
│ (2-10 pods) │ │ (2-8 pods)  │ │ (2-10 pods) │ │ (2-8 pods)  │
└──────┬──────┘ └─────────────┘ └──────┬──────┘ └─────────────┘
       │                               │
       ├───────────────┬───────────────┘
       ▼               ▼
┌──────────────┐ ┌──────────────┐
│upload-service│ │analytics-api │
│ (3-15 pods)  │ │ (2-10 pods)  │
└──────┬───────┘ └──────┬───────┘
       │                │
       ▼                ▼
┌───────────────────────────────┐
│  Redis (AOF) & Postgres DB    │
└──────────────┬────────────────┘
               │
      ┌────────┼────────┐
      ▼        ▼        ▼
┌───────────┐┌───────────┐┌───────────┐
│ocr-worker ││parser-work││matcher-w. │ ... (insights, export)
│(3-10 pods)││(3-10 pods)││(3-10 pods)│
└───────────┘└───────────┘└───────────┘
```

#### Load Balancing Strategies

1. **Edge / Ingress Level:**
   - **Path routing:** `/api` and `/api/*` route to `api-gateway:3000`; root `/` routes to `frontend-dashboard:80`.
   - **Algorithms:** `ewma` (Exponentially Weighted Moving Average) on Ingress, `least_conn;` on In-Cluster Edge Load Balancer.
   - **Upload optimization:** `proxy-body-size: 50m` with 60s timeout buffers for large PDF/DOCX resumes.
   - **Failure resilience:** Automatic upstream retries on `error timeout http_502 http_503 http_504`.
2. **Internal Service Level:**
   - Every service is exposed via Kubernetes `ClusterIP` Service with `sessionAffinity: None` for even round-robin traffic distribution.
   - Readiness probes ensure pods only receive traffic after dependencies are verified healthy.
3. **Autoscaling (HPA v2):**
   - Microservices auto-scale dynamically based on CPU and Memory targets:
     - `api-gateway`: 2 to 10 replicas (70% CPU / 80% Memory).
     - `upload-service`: 3 to 15 replicas (70% CPU / 75% Memory).
     - `analytics-api`: 2 to 10 replicas (75% CPU / 80% Memory).
     - `frontend-dashboard`: 2 to 8 replicas (70% CPU / 80% Memory).
     - Background queue workers: 3 to 10 replicas.
4. **Shared Storage (RWX):**
   - `upload-service` writes uploaded files to `/app/uploads` and `ocr-worker` reads them.
   - In Kubernetes, `uploads-data-pvc` uses `ReadWriteMany` (RWX) access mode (via cloud NFS/EFS/Filestore/Longhorn), or RWO for single-node development.
5. **Zero-Trust Security:**
   - Kubernetes `NetworkPolicy` objects restrict inter-pod communication:
     - Ingress/Edge Proxy can only reach `frontend` and `api-gateway`.
     - `api-gateway` can only reach `upload-service` and `analytics-api`.
     - Only authorized workers and API services can connect to PostgreSQL (5432) and Redis (6379).

### Ports (reference)

| Service              | Compose  | Local dev | Kubernetes Service          |
| -------------------- | -------- | --------- | --------------------------- |
| Frontend             | 80       | 8080      | 80 (ClusterIP)              |
| API Gateway          | 3000     | 3000      | 3000 (ClusterIP)            |
| Upload Service       | 3001     | 3001      | 3001 (ClusterIP)            |
| Analytics API        | 3002     | 3002      | 3002 (ClusterIP)            |
| PostgreSQL           | 5432     | 5432      | 5432 (ClusterIP / Headless) |
| Redis                | 6379     | 6379      | 6379 (ClusterIP / Headless) |
| Edge Ingress / Proxy | 80 / 443 | -         | 80 (LoadBalancer / Ingress) |
| Prometheus           | 9090     | 9090      | 9090 (ClusterIP)            |
| Grafana              | 3030     | 3030      | 3030 (ClusterIP)            |

---

## Shared packages (monorepo)

- **config** — Env, ports, DB/Redis config.
- **logger** — Structured logging.
- **queue-lib** — BullMQ producers/consumers (Node).
- **resume-nlp** — NLP helpers (Node).
- **role-matching** — Matching/scoring logic.

Workers and APIs use these packages for consistency and reuse.

---

## Related docs

- [System design](../system-design/Resume_Inteligence_Platform_System_Design.png) · [Processing flow](../system-design/Resume_Processing_Job_Flow.png)
- [Infrastructure](../../infra/README.md) — Compose files, Swarm, backup, monitoring.
- [Runbooks](../runbooks/README.md) — Operations and incident response.
