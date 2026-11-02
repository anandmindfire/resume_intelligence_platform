"""Tests for services.health.check_health (Redis and Tesseract mocked)."""
from unittest.mock import MagicMock

import pytesseract
import pytest
import redis

from services.health import check_health


@pytest.fixture
def redis_ctor(monkeypatch):
    ctor = MagicMock(name="Redis")
    monkeypatch.setattr(redis, "Redis", ctor)
    return ctor


@pytest.fixture
def ocr(monkeypatch):
    mock = MagicMock(name="image_to_string", return_value="")
    monkeypatch.setattr(pytesseract, "image_to_string", mock)
    return mock


def test_all_dependencies_healthy(redis_ctor, ocr):
    assert check_health() == {"status": "healthy", "checks": {"redis": "healthy", "tesseract": "healthy"}}
    redis_ctor.return_value.ping.assert_called_once()
    ocr.assert_called_once()


def test_redis_connection_settings_come_from_env(monkeypatch, redis_ctor, ocr):
    monkeypatch.setenv("REDIS_HOST", "10.0.0.5")
    monkeypatch.setenv("REDIS_PORT", "6390")
    monkeypatch.setenv("REDIS_PASSWORD", "pw")
    check_health()
    redis_ctor.assert_called_once_with(host="10.0.0.5", port=6390, password="pw", socket_connect_timeout=2)


def test_redis_failure_marks_unhealthy(redis_ctor, ocr):
    redis_ctor.return_value.ping.side_effect = redis.ConnectionError("Connection refused")
    result = check_health()
    assert result["status"] == "unhealthy"
    assert result["checks"]["redis"] == "unhealthy: Connection refused"
    assert result["checks"]["tesseract"] == "healthy"


def test_invalid_redis_port_marks_unhealthy(monkeypatch, redis_ctor, ocr):
    monkeypatch.setenv("REDIS_PORT", "not-a-port")
    result = check_health()
    assert result["checks"]["redis"].startswith("unhealthy:")
    redis_ctor.assert_not_called()


def test_tesseract_failure_marks_unhealthy(redis_ctor, ocr):
    ocr.side_effect = pytesseract.TesseractNotFoundError()
    result = check_health()
    assert result["status"] == "unhealthy"
    assert result["checks"]["redis"] == "healthy"
    assert result["checks"]["tesseract"].startswith("unhealthy:")


def test_both_failures_reported(redis_ctor, ocr):
    redis_ctor.side_effect = RuntimeError("r")
    ocr.side_effect = RuntimeError("t")
    assert check_health() == {
        "status": "unhealthy",
        "checks": {"redis": "unhealthy: r", "tesseract": "unhealthy: t"},
    }
