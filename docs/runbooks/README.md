# Runbooks

Operational runbooks for the Resume Intelligence Platform: day-to-day operations, incident response, and troubleshooting.

## Index

| Runbook                                   | Purpose                                                             |
| ----------------------------------------- | ------------------------------------------------------------------- |
| [Operations](operations.md)               | Start/stop stack, scaling, backups, health checks, load testing     |
| [Incident response](incident-response.md) | Unhealthy services, queue backlogs, DB/Redis issues, recovery steps |
| [Troubleshooting](troubleshooting.md)     | Common errors, logs, debugging, port and env issues                 |

## Quick reference

### Health check (all critical services)

```bash
./infra/health-checks/health-check.sh
# Or: pnpm infra:health (if script is wired in package.json)
```

### Start / stop

```bash
# Full stack (Compose)
pnpm run docker:microservices
docker-compose -f infra/docker-compose/docker-compose.microservices.yml down

# Swarm
pnpm run swarm:deploy
pnpm run swarm:stop

# Kubernetes (Helm)
pnpm helm:install:dev   # or :prod
pnpm helm:uninstall

# Kubernetes (Kustomize)
pnpm k8s:start:dev      # or :prod
pnpm k8s:stop
```

### Kubernetes Status & Diagnostics

```bash
pnpm k8s:status
kubectl get pods,svc,hpa,ingress -n resume-platform
```

### Scale upload-service (Swarm & Kubernetes)

```bash
# Swarm:
./scripts/scale-upload.sh 5

# Kubernetes (manual):
kubectl scale deployment upload-service --replicas=5 -n resume-platform

# Kubernetes (HPA tuning):
kubectl autoscale deployment upload-service --min=3 --max=15 --cpu-percent=70 -n resume-platform
```

### Backups

```bash
pnpm infra:backup:postgres
pnpm infra:backup:redis
```

### Load test

```bash
pnpm run load-test
```

See [Operations](operations.md) and [Incident response](incident-response.md) for detailed steps.
