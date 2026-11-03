# shared-python

Python modules shared by more than one worker (`ocr-worker-python`, `parser-worker-python`,
`insights-worker-python`). There is no shared Python package mechanism in this repo (each worker
ships as an independent image with its own `src/`), so sharing works differently in each context:

- **Docker (production):** each worker's Dockerfile copies the file directly into its own
  `src/services/` at build time, overwriting whatever a plain `COPY apps/<worker>/src ./src`
  would have placed there:
  ```dockerfile
  COPY apps/<worker>/src ./src
  COPY shared-python/services/logger.py ./src/services/logger.py
  ```
- **Local dev / pytest:** each worker's `pytest.ini` adds this directory to `pythonpath`
  alongside its own `src`. Since no `services/` directory here or in any worker's `src/` has an
  `__init__.py`, Python treats `services` as a PEP 420 namespace package and merges both
  locations — `services.logger` resolves from here, `services.db_service` etc. still resolve
  from the worker's own `src/services/`. No `sys.path` manipulation needed.

Both mechanisms keep every worker's `from services.logger import get_logger` working completely
unmodified while guaranteeing there is exactly one copy of the file to edit.

Don't add a worker-specific `src/services/logger.py` back; edit the one here instead.
