#!/usr/bin/env bash
# Deploy Resume Intelligence Platform to Kubernetes
# Usage: ./scripts/deploy-k8s.sh [--build] [--push] [--helm] [--overlay dev|prod] [--namespace <ns>]

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

BUILD_IMAGES=false
PUSH_IMAGES=false
USE_HELM=false
OVERLAY="dev"
NAMESPACE="resume-platform"
REGISTRY="${DOCKER_REGISTRY:-""}"
TAG="${IMAGE_TAG:-"latest"}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --build)
      BUILD_IMAGES=true
      shift
      ;;
    --push)
      PUSH_IMAGES=true
      shift
      ;;
    --helm)
      USE_HELM=true
      shift
      ;;
    --overlay)
      OVERLAY="$2"
      shift 2
      ;;
    --namespace)
      NAMESPACE="$2"
      shift 2
      ;;
    --prod)
      OVERLAY="prod"
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--build] [--push] [--helm] [--overlay dev|prod] [--namespace <ns>]"
      exit 1
      ;;
  esac
done

echo "=========================================================="
echo " Deploying Resume Intelligence Platform to Kubernetes"
echo "=========================================================="
echo " Overlay / Profile: $OVERLAY"
echo " Method:            $([ "$USE_HELM" = true ] && echo "Helm" || echo "kubectl kustomize")"
echo " Target Namespace:  $NAMESPACE"
echo " Image Tag:         $TAG"
[ -n "$REGISTRY" ] && echo " Registry:          $REGISTRY"
echo "=========================================================="

# 1. Build and push images if requested
if [ "$BUILD_IMAGES" = true ]; then
  echo ""
  echo "--- Step 1: Building microservices container images ---"
  ./scripts/build-all-services.sh "$TAG"
fi

if [ "$PUSH_IMAGES" = true ]; then
  echo ""
  echo "--- Step 1b: Pushing container images to registry ---"
  ./scripts/push-all-services.sh "$TAG"
fi

# 2. Deploy using Helm or Kustomize
if [ "$USE_HELM" = true ]; then
  echo ""
  echo "--- Step 2: Deploying via Helm ---"
  VALUES_FILE="infra/k8s/helm/resume-platform/values-${OVERLAY}.yaml"
  HELM_ARGS=(
    upgrade --install resume-platform infra/k8s/helm/resume-platform
    --namespace "$NAMESPACE"
    --create-namespace
  )
  if [ -f "$VALUES_FILE" ]; then
    HELM_ARGS+=(-f "$VALUES_FILE")
  fi
  helm "${HELM_ARGS[@]}"
else
  echo ""
  echo "--- Step 2: Deploying via kubectl kustomize (overlay: $OVERLAY) ---"
  # Clean up completed db-init-job to avoid immutable field errors on re-apply
  kubectl delete job db-init-job -n "$NAMESPACE" --ignore-not-found=true 2>/dev/null || true
  kubectl apply -k "infra/k8s/overlays/${OVERLAY}"
fi

# 3. Wait for database and cache rollout
echo ""
echo "--- Step 3: Waiting for database and cache readiness ---"
kubectl rollout status statefulset/postgres -n "$NAMESPACE" --timeout=120s || true
kubectl rollout status statefulset/redis -n "$NAMESPACE" --timeout=120s || true

# 4. Wait for deployments
echo ""
echo "--- Step 4: Waiting for microservices rollout ---"
DEPLOYMENTS=(
  "api-gateway"
  "upload-service"
  "analytics-api"
  "frontend-dashboard"
  "ocr-worker"
  "parser-worker"
  "matcher-worker"
  "insights-worker"
  "export-worker"
  "edge-proxy"
)

for dep in "${DEPLOYMENTS[@]}"; do
  echo "Checking $dep..."
  kubectl rollout status "deployment/$dep" -n "$NAMESPACE" --timeout=90s || true
done

echo ""
echo "=========================================================="
echo " Deployment Summary for namespace: $NAMESPACE"
echo "=========================================================="
echo "Pods:"
kubectl get pods -n "$NAMESPACE" -o wide || true
echo ""
echo "Services & Load Balancers:"
kubectl get svc -n "$NAMESPACE" || true
echo ""
echo "Ingress:"
kubectl get ingress -n "$NAMESPACE" 2>/dev/null || true
echo ""
echo "Autoscalers (HPA):"
kubectl get hpa -n "$NAMESPACE" 2>/dev/null || true
echo ""
echo "Resume Intelligence Platform successfully deployed!"

