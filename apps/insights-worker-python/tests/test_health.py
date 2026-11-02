"""Tests for services.health.check_health (Redis and Postgres mocked)."""
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


def test_all_dependencies_healthy(redis_ctor, pg_connect):
    assert check_health() == {"status": "healthy", "checks": {"redis": "healthy", "postgres": "healthy"}}
    redis_ctor.return_value.ping.assert_called_once()
    pg_connect.return_value.close.assert_called_once()


def test_connection_settings_come_from_env(monkeypatch, redis_ctor, pg_connect):
    for key, value in {
        "REDIS_HOST": "rh", "REDIS_PORT": "6390", "REDIS_PASSWORD": "rpw", "POSTGRES_HOST": "ph",
        "POSTGRES_PORT": "5433", "POSTGRES_USER": "u", "POSTGRES_PASSWORD": "p", "POSTGRES_DB": "d",
    }.items():
        monkeypatch.setenv(key, value)

    check_health()

    redis_ctor.assert_called_once_with(host="rh", port=6390, password="rpw", socket_connect_timeout=2)
    pg_connect.assert_called_once_with(
        host="ph", port=5433, user="u", password="p", database="d", connect_timeout=2
    )


def test_defaults(redis_ctor, pg_connect):
    check_health()
    redis_ctor.assert_called_once_with(host="redis", port=6379, password=None, socket_connect_timeout=2)
    pg_connect.assert_called_once_with(
        host="postgres", port=5432, user="postgres", password="postgres", database="resume_db", connect_timeout=2
    )


def test_redis_failure(redis_ctor, pg_connect):
    redis_ctor.return_value.ping.side_effect = redis.ConnectionError("refused")
    assert check_health() == {
        "status": "unhealthy",
        "checks": {"redis": "unhealthy: refused", "postgres": "healthy"},
    }


def test_postgres_failure(redis_ctor, pg_connect):
    pg_connect.side_effect = psycopg2.OperationalError("timeout expired")
    assert check_health() == {
        "status": "unhealthy",
        "checks": {"redis": "healthy", "postgres": "unhealthy: timeout expired"},
    }
