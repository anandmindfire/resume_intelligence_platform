"""Shared fixtures for the insights worker test suite."""
import pytest


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
