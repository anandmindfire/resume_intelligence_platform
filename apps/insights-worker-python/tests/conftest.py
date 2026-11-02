"""Shared fixtures for the insights worker test suite.

Logger shim
-----------
``src/services/logger.py`` in this worker is not importable on its own: it
prepends a non-existent path and then does ``from services.logger import
get_logger`` -- i.e. imports itself -- which raises a circular ImportError.
In production this never runs because the Dockerfile copies
``apps/ocr-worker-python/src/services`` over this worker's ``services/``.

To mirror that build step without modifying source, we pre-register the OCR
worker's logger module as ``services.logger`` before any test imports worker
code. ``tests/test_logger.py`` documents the broken standalone import as an
xfail.
"""
import importlib.util
import sys
from pathlib import Path

import pytest

_OCR_LOGGER = Path(__file__).resolve().parents[2] / "ocr-worker-python" / "src" / "services" / "logger.py"


def _install_logger_shim():
    if "services.logger" in sys.modules:
        return
    import services  # namespace package rooted at this worker's src/

    spec = importlib.util.spec_from_file_location("services.logger", _OCR_LOGGER)
    module = importlib.util.module_from_spec(spec)
    sys.modules["services.logger"] = module
    spec.loader.exec_module(module)
    services.logger = module


_install_logger_shim()


_ENV_VARS = (
    "REDIS_HOST",
    "REDIS_PORT",
    "REDIS_PASSWORD",
    "INSIGHTS_WORKER_CONCURRENCY",
    "POSTGRES_HOST",
    "POSTGRES_PORT",
    "POSTGRES_USER",
    "POSTGRES_PASSWORD",
    "POSTGRES_DB",
    "LOG_FORMAT",
    "LOG_LEVEL",
)


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    for name in _ENV_VARS:
        monkeypatch.delenv(name, raising=False)


@pytest.fixture(autouse=True)
def _reset_db_pool():
    """DBService keeps a class-level pool; never let one leak between tests."""
    from services.db_service import DBService

    DBService._connection_pool = None
    yield
    DBService._connection_pool = None


@pytest.fixture
def no_sleep(monkeypatch):
    calls = []
    import time

    monkeypatch.setattr(time, "sleep", lambda s: calls.append(s))
    return calls
