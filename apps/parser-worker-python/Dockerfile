FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY apps/parser-worker-python/requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Install spaCy English model (compatible with spacy 3.7.2)
RUN pip install --no-cache-dir https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.7.1/en_core_web_sm-3.7.1-py3-none-any.whl

# Copy source code
COPY apps/parser-worker-python/src ./src
COPY shared-python/services/logger.py ./src/services/logger.py

WORKDIR /app/src

ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app/src

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import sys; sys.path.insert(0, '/app/src'); from services.health import check_health; import json; result = check_health(); sys.exit(0 if result['status'] == 'healthy' else 1)" || exit 1

# Unprivileged runtime user. uid 1000 matches the Node services' `node` user, so files the upload
# service writes with mode 0600 on the shared uploads volume are readable here and nowhere else.
RUN groupadd --system --gid 1000 app \
    && useradd --system --uid 1000 --gid app --no-create-home --shell /usr/sbin/nologin app \
    && mkdir -p /app/uploads && chown app:app /app/uploads && chmod 0700 /app/uploads
USER app

CMD ["python", "main.py"]
