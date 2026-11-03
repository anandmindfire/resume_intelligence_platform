#!/usr/bin/env bash
# Initialize database schema in Kubernetes
# Usage: ./scripts/init-db-k8s.sh [--namespace <ns>]

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

NAMESPACE="${NAMESPACE:-"resume-platform"}"
INIT_SQL="${INIT_SQL:-"infra/postgres/init.sql"}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --namespace)
      NAMESPACE="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--namespace <ns>]"
      exit 1
      ;;
  esac
done

echo "Checking for Postgres pod in namespace $NAMESPACE..."
POD=$(kubectl get pods -n "$NAMESPACE" -l "app.kubernetes.io/name=postgres" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)

if [ -z "$POD" ]; then
  echo "Error: No Postgres pod found in namespace $NAMESPACE."
  exit 1
fi

echo "Waiting for pod $POD to be ready..."
kubectl wait --for=condition=Ready "pod/$POD" -n "$NAMESPACE" --timeout=60s

echo "Applying init.sql directly to pod $POD..."
kubectl exec -i "$POD" -n "$NAMESPACE" -- psql -U postgres -d resume_platform < "$INIT_SQL"

echo "Database initialization script applied successfully!"

