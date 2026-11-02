"""Shared fixtures for the OCR worker test suite.

All external systems (Redis, Tesseract, poppler) are mocked; nothing here
touches the network or requires system binaries.
"""
import pytest

_ENV_VARS = (
    "REDIS_HOST",
    "REDIS_PORT",
    "REDIS_PASSWORD",
    "OCR_WORKER_CONCURRENCY",
    "TESSERACT_CMD",
    "TESSERACT_LANG",
    "LOG_FORMAT",
    "LOG_LEVEL",
)


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    """Make every test start from the code's defaults, regardless of the host env."""
    for name in _ENV_VARS:
        monkeypatch.delenv(name, raising=False)


@pytest.fixture
def no_sleep(monkeypatch):
    """Replace time.sleep with a recorder so retry/backoff paths run instantly."""
    calls = []
    import time

    monkeypatch.setattr(time, "sleep", lambda s: calls.append(s))
    return calls
