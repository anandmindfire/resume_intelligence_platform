"""Tests for services.logger in the parser worker.

See conftest.py: this module is shimmed with the OCR worker's logger for the
rest of the suite. Here we load the worker's own file to document that it is
not importable outside the Docker image.
"""
import importlib
import json
import logging
import sys

import pytest

import services


def test_shimmed_logger_produces_json(capsys):
    from services.logger import get_logger

    logger = get_logger("parser.test.shim")
    logger.info("parsed resume")
    record = json.loads(capsys.readouterr().err.strip().splitlines()[-1])
    assert record["message"] == "parsed resume"
    assert record["logger"] == "parser.test.shim"
    assert isinstance(logger, logging.Logger)


@pytest.mark.xfail(
    reason="BUG: parser-worker-python/src/services/logger.py:4-5 inserts a non-existent path "
    "(<worker>/ocr-worker-python/src) and then imports `services.logger` -- itself -- so importing it "
    "raises a circular ImportError. It only works in Docker because the Dockerfile overwrites "
    "services/ with the OCR worker's copy; running the worker locally (python src/main.py) crashes.",
    raises=ImportError,
    strict=True,
)
def test_worker_logger_module_is_importable_standalone(monkeypatch):
    monkeypatch.delitem(sys.modules, "services.logger")
    monkeypatch.setattr(services, "logger", None, raising=False)
    monkeypatch.setattr(sys, "path", list(sys.path))
    module = importlib.import_module("services.logger")
    assert callable(module.get_logger)
