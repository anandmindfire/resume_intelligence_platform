FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-eng \
    poppler-utils \
    libpoppler-cpp-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements
COPY apps/ocr-worker-python/requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY apps/ocr-worker-python/src ./src
COPY shared-python/services/logger.py ./src/services/logger.py

WORKDIR /app/src

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV TESSERACT_CMD=/usr/bin/tesseract
ENV TESSERACT_LANG=eng
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
