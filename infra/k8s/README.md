# Kubernetes Infrastructure & Production Load Balancing

Production-ready Kubernetes architecture for the **Resume Intelligence Platform**.

---

## Architecture Overview

```
                      Internet / Client Traffic
                                 │
                 ┌───────────────┴───────────────┐
                 │                               │
                 ▼                               ▼
       [ NGINX Ingress ]            [ In-Cluster Edge LB ]
     (Path & Host routing)        (least_conn Load Balancer)
      /api/*          /*                 /api/*          /*
        │             │                    │             │
        ▼             ▼                    ▼             ▼
  ┌───────────┐ ┌───────────┐        ┌───────────┐ ┌───────────┐
  │api-gateway│ │ frontend  │        │api-gateway│ │ frontend  │
  │  (2-10    │ │  (2-8     │        │  (2-10    │ │  (2-8     │
  │ replicas) │ │ replicas) │        │ replicas) │ │ replicas) │
  └─────┬─────┘ └───────────┘        └─────┬─────┘ └───────────┘
        │                                  │
        ├─────────────────┬────────────────┘
        ▼                 ▼
 ┌──────────────┐  ┌──────────────┐
 │upload-service│  │analytics-api │
 │(3-15 replicas│  │(2-10 replicas│
 └──────┬───────┘  └──────┬───────┘
        │                 │
        ▼                 ▼
 ┌──────────────────────────────────────────────┐
 │     BullMQ Redis Queue & PostgreSQL DB       │
 └──────────────────────┬───────────────────────┘
                        │
       ┌────────────────┼────────────────┐
       ▼                ▼                ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ ocr-worker  │  │parser-worker│  │matcher-work.│ ... (insights, export)
│(3-10 replicas) (3-10 replicas) (3-10 replicas)
└─────────────┘  └─────────────┘  └─────────────┘
```

---

## Load Balancing Design

### 1. External & Edge Load Balancing

Two deployment options are provided out-of-the-box:

- **Kubernetes Ingress (`ingress.yaml`)**:
  - Compatible with `ingress-nginx`, AWS ALB, GCP GKE Ingress, Traefik, etc.
  - Load balancing algorithm: `ewma` (Exponentially Weighted Moving Average) or `least_conn`.
  - Upstream request retries: `error timeout http_502 http_503 http_504` with 3 retries.
  - Large upload capability: `proxy-body-size: 50m` (required for multi-page resume documents).
  - Timeout buffers: `60s` connect/read/send timeouts.
  - Request ID injection (`X-Request-ID`) for distributed tracing across services.
  - SSL/TLS termination with cert-manager / Let's Encrypt automated certificates.

- **In-Cluster Edge Reverse Proxy Load Balancer (`edge-proxy.yaml`)**:
  - High-performance Nginx reverse proxy exposed as `LoadBalancer` (cloud) or `NodePort` (local).
  - Uses `least_conn;` upstream pools to distribute traffic evenly across available pod replicas.
  - Ideal for bare-metal, private clouds, or environments without a pre-installed Ingress Controller.

### 2. Internal Service Load Balancing

- Every microservice is exposed via a dedicated Kubernetes `ClusterIP` Service.
- Kube-proxy / IPVS / eBPF automatically distributes internal traffic evenly.
- `sessionAffinity: None` ensures equal round-robin load distribution.
- **Readiness Probes** ensure pods are only routed traffic after they have successfully booted and passed dependency checks.

### 3. Horizontal Pod Autoscaling (HPA)

- Autoscaling based on real-time CPU & Memory utilization:
  - `api-gateway`: 2 to 10 replicas (target 70% CPU, 80% Memory).
  - `upload-service`: 3 to 15 replicas (target 70% CPU, 75% Memory).
  - `analytics-api`: 2 to 10 replicas (target 75% CPU, 80% Memory).
  - `frontend-dashboard`: 2 to 8 replicas (target 70% CPU, 80% Memory).
  - Background workers (`ocr-worker`, `parser-worker`, `matcher-worker`): 3 to 10 replicas.
- Scale-up policy: Rapid (100% burst capacity or +2/3 pods every 15s).
- Scale-down policy: Conservative (300s stabilization window) to avoid flapping during traffic dips.

---

## Directory Structure

```
infra/k8s/
├── base/                              # Core Kubernetes manifests
│   ├── namespace.yaml                 # resume-platform namespace
│   ├── configmap.yaml                 # Shared platform environment variables
│   ├── secret.yaml                    # Credentials (passwords, JWT secret)
│   ├── storage/                       # PersistentVolumeClaims
│   │   ├── postgres-pvc.yaml          # PostgreSQL storage (10Gi)
│   │   ├── redis-pvc.yaml             # Redis storage (5Gi)
│   │   ├── uploads-pvc.yaml           # Shared uploads storage (20Gi, RWX)
│   │   └── exports-pvc.yaml           # Shared exports storage (5Gi, RWX)
│   ├── database/                      # PostgreSQL StatefulSet & Init Job
│   │   ├── postgres-configmap.yaml    # Schema init.sql
│   │   ├── postgres-statefulset.yaml  # PostgreSQL 15 StatefulSet
│   │   ├── postgres-service.yaml      # ClusterIP + Headless Service
│   │   └── db-init-job.yaml           # Automated idempotent migration job
│   ├── redis/                         # Redis StatefulSet & Config
│   │   ├── redis-configmap.yaml       # redis.conf (AOF persistence)
│   │   ├── redis-statefulset.yaml     # Redis 7 StatefulSet
│   │   └── redis-service.yaml         # ClusterIP + Headless Service
│   ├── apps/                          # Deployments & Services
│   │   ├── api-gateway/
│   │   ├── upload-service/
│   │   ├── analytics-api/
│   │   └── frontend/
│   ├── workers/                       # Background Queue Workers
│   │   ├── ocr-worker/
│   │   ├── parser-worker/
│   │   ├── matcher-worker/
│   │   ├── insights-worker/
│   │   └── export-worker/
│   ├── ingress/
│   │   ├── ingress.yaml               # Ingress resource (Nginx / Cloud)
│   │   └── edge-proxy.yaml            # Standalone Nginx LB Service
│   ├── autoscaling/                   # HPA v2 definitions
│   ├── pdb/                           # Pod Disruption Budgets
│   └── network-policies/              # Zero-Trust Pod Security
│
├── overlays/
│   ├── dev/                           # Minikube / Kind / Docker Desktop (1 replica, RWO)
│   │   └── kustomization.yaml
│   └── prod/                          # Production (High replicas, RWX, TLS)
│       └── kustomization.yaml
│
└── helm/resume-platform/              # Enterprise Helm 3 Chart
    ├── Chart.yaml
    ├── values.yaml                    # Default values
    ├── values-dev.yaml                # Dev overrides
    ├── values-prod.yaml               # Production overrides
    └── templates/                     # Templated manifests
```

---

## Deployment Quick Start

### Method 1: Using Helm (Recommended)

```bash
# 1. Deploy with development profile (lightweight)
pnpm helm:install:dev

# 2. Or deploy with production profile
pnpm helm:install:prod

# 3. Upgrade release after changes
pnpm helm:upgrade

# 4. Check status
pnpm k8s:status

# 5. Uninstall release
pnpm helm:uninstall
```

### Method 2: Using `kubectl` / Kustomize

```bash
# Deploy dev overlay (Minikube / Kind / Docker Desktop)
pnpm k8s:start:dev

# Deploy production overlay
pnpm k8s:start:prod

# Teardown
pnpm k8s:stop
```

### Method 3: Using the Deployment Script

```bash
# Build images and deploy dev overlay
./scripts/deploy-k8s.sh --build --overlay dev

# Deploy to production cluster via Helm
./scripts/deploy-k8s.sh --helm --overlay prod
```

---

## Production Readiness Checklist

| Feature               | Implementation                                                                  | Benefit                                                      |
| --------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **High Availability** | Multi-replica deployments (2 to 5 min replicas) with anti-affinity across nodes | Survives node failures without service disruption            |
| **Load Balancing**    | `ewma` / `least_conn` on Ingress + ClusterIP kube-proxy                         | Prevents hot-spotting on busy worker pods                    |
| **Zero Downtime**     | `RollingUpdate` with `maxSurge: 1`, `maxUnavailable: 0`                         | Seamless application updates                                 |
| **Pod Disruption**    | `PodDisruptionBudget` on all critical services                                  | Guarantees minimum available pods during cluster maintenance |
| **Health Checks**     | Configured `livenessProbe` and `readinessProbe` on all 9 services               | Removes unhealthy pods before traffic fails                  |
| **Resource Limits**   | Strict CPU/Memory requests & limits                                             | Prevents noisy-neighbor OOM crashes                          |
| **Security**          | `allowPrivilegeEscalation: false`, dropped capabilities (`ALL`), non-root       | Mitigates container breakout risks                           |
| **Network Isolation** | `NetworkPolicy` restricting inter-pod communication                             | Enforces zero-trust internal network boundaries              |
| **Storage Handling**  | Dedicated PVCs with RWX support for uploads / exports                           | Shared resume files across upload and OCR services           |
| **Graceful Shutdown** | `terminationGracePeriodSeconds: 30`                                             | Allows queue workers to drain in-flight jobs cleanly         |
