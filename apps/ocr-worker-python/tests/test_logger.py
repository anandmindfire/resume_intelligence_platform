"""Tests for services.logger (JSON / text formatting, level config)."""
import io
import json
import logging
import sys
import uuid

import pytest

from services.logger import JsonFormatter, get_logger


@pytest.fixture
def fresh_name():
    """Unique logger name per test (get_logger caches handlers per name)."""
    names = []

    def _make():
        name = f"test.{uuid.uuid4().hex}"
        names.append(name)
        return name

    yield _make
    for name in names:
        logging.getLogger(name).handlers.clear()


def _capture(logger):
    """Redirect the logger's single stream handler into a buffer."""
    [handler] = logger.handlers
    buf = io.StringIO()
    handler.setStream(buf)
    return buf


def test_default_logger_emits_json_at_info(fresh_name):
    name = fresh_name()
    logger = get_logger(name)
    buf = _capture(logger)

    logger.debug("hidden")
    logger.info("Processing resume r1")

    [line] = buf.getvalue().strip().splitlines()
    record = json.loads(line)
    assert record["level"] == "INFO"
    assert record["logger"] == name
    assert record["message"] == "Processing resume r1"
    assert "timestamp" in record
    assert logger.level == logging.INFO


def test_text_format_and_custom_level(monkeypatch, fresh_name):
    monkeypatch.setenv("LOG_FORMAT", "text")
    monkeypatch.setenv("LOG_LEVEL", "debug")
    logger = get_logger(fresh_name())
    buf = _capture(logger)

    logger.debug("details")
    out = buf.getvalue()
    assert "DEBUG: details" in out
    with pytest.raises(json.JSONDecodeError):
        json.loads(out)


def test_get_logger_does_not_duplicate_handlers(fresh_name):
    name = fresh_name()
    first = get_logger(name)
    second = get_logger(name)
    assert first is second
    assert len(second.handlers) == 1


def test_json_formatter_includes_exception_and_service():
    try:
        raise ValueError("bad input")
    except ValueError:
        record = logging.LogRecord("svc", logging.ERROR, __file__, 1, "failed", None, sys.exc_info())
    record.service = "ocr-worker"

    data = json.loads(JsonFormatter().format(record))
    assert data["service"] == "ocr-worker"
    assert "ValueError: bad input" in data["exception"]
    assert data["level"] == "ERROR"


def test_json_formatter_omits_optional_fields_when_absent():
    record = logging.LogRecord("svc", logging.INFO, __file__, 1, "hello %s", ("world",), None)
    data = json.loads(JsonFormatter().format(record))
    assert data["message"] == "hello world"
    assert "exception" not in data and "service" not in data


@pytest.mark.xfail(
    reason="BUG: callers throughout the workers (e.g. main.py:29, queue_service.py:118) pass a context "
    "dict as a positional logging arg, which logging treats as %-format mapping; JsonFormatter only "
    "emits record.getMessage(), so all structured context (resume_id, queue, error...) is silently "
    "dropped from the JSON logs.",
    strict=True,
)
def test_context_dict_passed_by_callers_reaches_json_output(fresh_name):
    logger = get_logger(fresh_name())
    buf = _capture(logger)
    logger.info("Processing OCR job", {"resume_id": "r1"})
    assert "r1" in buf.getvalue()
