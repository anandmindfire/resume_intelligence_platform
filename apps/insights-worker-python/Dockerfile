FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

COPY apps/insights-worker-python/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY apps/insights-worker-python/src ./src
COPY shared-python/services/logger.py ./src/services/logger.py

WORKDIR /app/src

ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app/src

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import sys; sys.path.insert(0, '/app/src'); from services.health import check_health; import json; result = check_health(); sys.exit(0 if result['status'] == 'healthy' else 1)" || exit 1

CMD ["python", "main.py"]
