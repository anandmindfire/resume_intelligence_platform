"""Tests for services.health.check_health (Redis, Postgres and spaCy mocked).

spaCy is replaced in sys.modules with a stub so no model is ever downloaded or
loaded; the missing-model and missing-package paths are exercised explicitly.
"""
import sys
import types
from unittest.mock import MagicMock

import psycopg2
import pytest
import redis

from services.health import check_health


@pytest.fixture
def redis_ctor(monkeypatch):
    ctor = MagicMock(name="Redis")
    monkeypatch.setattr(redis, "Redis", ctor)
    return ctor


@pytest.fixture
def pg_connect(monkeypatch):
    connect = MagicMock(name="psycopg2.connect")
    monkeypatch.setattr(psycopg2, "connect", connect)
    return connect


@pytest.fixture
def spacy_stub(monkeypatch):
    stub = types.ModuleType("spacy")
    stub.load = MagicMock(name="spacy.load", return_value=object())
    monkeypatch.setitem(sys.modules, "spacy", stub)
    return stub


def test_all_dependencies_healthy(redis_ctor, pg_connect, spacy_stub):
    assert check_health() == {
        "status": "healthy",
        "checks": {"redis": "healthy", "postgres": "healthy", "spacy": "healthy"},
    }
    redis_ctor.return_value.ping.assert_called_once()
    pg_connect.return_value.close.assert_called_once()
    spacy_stub.load.assert_called_once_with("en_core_web_sm")


def test_connection_settings_come_from_env(monkeypatch, redis_ctor, pg_connect, spacy_stub):
    monkeypatch.setenv("REDIS_HOST", "rh")
    monkeypatch.setenv("REDIS_PORT", "6390")
    monkeypatch.setenv("REDIS_PASSWORD", "rpw")
    monkeypatch.setenv("POSTGRES_HOST", "ph")
    monkeypatch.setenv("POSTGRES_PORT", "5433")
    monkeypatch.setenv("POSTGRES_USER", "u")
    monkeypatch.setenv("POSTGRES_PASSWORD", "p")
    monkeypatch.setenv("POSTGRES_DB", "d")

    check_health()

    redis_ctor.assert_called_once_with(host="rh", port=6390, password="rpw", socket_connect_timeout=2)
    pg_connect.assert_called_once_with(
        host="ph", port=5433, user="u", password="p", database="d", connect_timeout=2
    )


def test_postgres_defaults(redis_ctor, pg_connect, spacy_stub):
    check_health()
    pg_connect.assert_called_once_with(
        host="postgres", port=5432, user="postgres", password="postgres", database="resume_db", connect_timeout=2
    )


def test_redis_failure_marks_unhealthy(redis_ctor, pg_connect, spacy_stub):
    redis_ctor.return_value.ping.side_effect = redis.ConnectionError("refused")
    result = check_health()
    assert result["status"] == "unhealthy"
    assert result["checks"] == {"redis": "unhealthy: refused", "postgres": "healthy", "spacy": "healthy"}


def test_postgres_failure_marks_unhealthy(redis_ctor, pg_connect, spacy_stub):
    pg_connect.side_effect = psycopg2.OperationalError("could not connect")
    result = check_health()
    assert result["status"] == "unhealthy"
    assert result["checks"]["postgres"] == "unhealthy: could not connect"
    assert result["checks"]["redis"] == "healthy"


def test_missing_spacy_model_marks_unhealthy(redis_ctor, pg_connect, spacy_stub):
    spacy_stub.load.side_effect = OSError("[E050] Can't find model 'en_core_web_sm'")
    result = check_health()
    assert result["status"] == "unhealthy"
    assert result["checks"]["spacy"].startswith("unhealthy: [E050]")


def test_spacy_not_installed_marks_unhealthy(monkeypatch, redis_ctor, pg_connect):
    monkeypatch.setitem(sys.modules, "spacy", None)  # makes `import spacy` raise ImportError
    result = check_health()
    assert result["status"] == "unhealthy"
    assert result["checks"]["spacy"].startswith("unhealthy:")
