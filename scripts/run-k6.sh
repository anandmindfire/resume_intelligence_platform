#!/usr/bin/env bash
# Run k6 load test: use local k6 if available, otherwise Docker (grafana/k6).
# Usage: ./scripts/run-k6.sh [k6 script path]
# Example: ./scripts/run-k6.sh load-testing/k6/upload.test.js
# ACCESS_TOKEN (optional) is sent as a Bearer token when the gateway requires OIDC auth.
# BASE_URL is passed through (default http://localhost:3000; works with Docker Compose gateway on host:3000).

set -e
SCRIPT="${1:-load-testing/k6/upload.test.js}"
BASE_URL="${BASE_URL:-http://localhost:3000}"

if command -v k6 >/dev/null 2>&1; then
  exec k6 run "$SCRIPT"
fi

# Use Docker when k6 is not installed
echo "k6 not found in PATH. Running via Docker (grafana/k6)..."
echo "To run locally, install k6: https://k6.io/docs/get-started/installation/ (e.g. brew install k6)"
echo ""

# When targeting host from inside Docker, use host.docker.internal (Mac/Windows) or host-gateway (Linux).
if [[ "$BASE_URL" == http://localhost* ]]; then
  PORT="${BASE_URL##*:}"
  export BASE_URL="http://host.docker.internal:${PORT}"
fi

docker run --rm -v "$(pwd):/app" -w /app --add-host=host.docker.internal:host-gateway \
  -e BASE_URL="$BASE_URL" -e FILES_PER_REQUEST="${FILES_PER_REQUEST:-5}" -e ACCESS_TOKEN="${ACCESS_TOKEN:-}" \
  grafana/k6 run "$SCRIPT"
