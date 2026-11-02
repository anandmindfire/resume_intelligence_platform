#!/usr/bin/env bash
# Run the pytest suites for every Python worker.
#
# Assumes each worker's dev requirements are already installed in the active
# environment, e.g.:
#   pip install -r apps/parser-worker-python/requirements-dev.txt
# Override the interpreter with PYTHON=/path/to/python.
# Extra arguments are passed through to pytest (e.g. --cov=src).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="${PYTHON:-python3}"
WORKERS=(ocr-worker-python parser-worker-python insights-worker-python)

failed=()
for worker in "${WORKERS[@]}"; do
  echo "==> ${worker}"
  if ! (cd "${ROOT_DIR}/apps/${worker}" && "${PYTHON_BIN}" -m pytest "$@"); then
    failed+=("${worker}")
  fi
  echo
done

if ((${#failed[@]} > 0)); then
  echo "Python tests FAILED in: ${failed[*]}" >&2
  exit 1
fi
echo "All Python worker tests passed."
