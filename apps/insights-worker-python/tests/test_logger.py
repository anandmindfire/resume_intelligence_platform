"""Tests for services.logger in the insights worker."""
import importlib
import json
import logging
import sys
from pathlib import Path


def test_logger_produces_json(capsys):
    from services.logger import get_logger

    logger = get_logger("insights.test.shim")
    logger.info("aggregated insights")
    record = json.loads(capsys.readouterr().err.strip().splitlines()[-1])
    assert record["message"] == "aggregated insights"
    assert record["logger"] == "insights.test.shim"
    assert isinstance(logger, logging.Logger)


def test_worker_logger_module_is_importable_standalone():
    module = importlib.import_module("services.logger")
    assert callable(module.get_logger)
    assert module.__file__.startswith(str(Path(__file__).resolve().parents[1] / "src"))


def test_context_dict_reaches_json_output():
    import io

    from services.logger import get_logger

    logger = get_logger("insights.test.context")
    [handler] = logger.handlers
    buf = io.StringIO()
    handler.setStream(buf)
    logger.info("Processing job done", {"resume_id": "r1"})
    record = json.loads(buf.getvalue())
    assert record["message"] == "Processing job done"
    assert record["context"] == {"resume_id": "r1"}
