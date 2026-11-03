#!/usr/bin/env bash
# Teardown Kubernetes deployment for Resume Intelligence Platform
# Usage: ./scripts/teardown-k8s.sh [--all] [--namespace <ns>]

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

NAMESPACE="${NAMESPACE:-"resume-platform"}"
DELETE_ALL=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --all)
      DELETE_ALL=true
      shift
      ;;
    --namespace)
      NAMESPACE="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--all] [--namespace <ns>]"
      exit 1
      ;;
  esac
done

echo "Tearing down Kubernetes resources in namespace: $NAMESPACE..."

if helm list -n "$NAMESPACE" | grep -q "resume-platform"; then
  echo "Uninstalling Helm release..."
  helm uninstall resume-platform -n "$NAMESPACE" || true
else
  echo "Deleting resources via Kustomize base..."
  kubectl delete -k infra/k8s/base --ignore-not-found=true || true
fi

if [ "$DELETE_ALL" = true ]; then
  echo "Deleting namespace and persistent volumes..."
  kubectl delete namespace "$NAMESPACE" --ignore-not-found=true || true
fi

echo "Teardown complete."

