"""Tests for services.logger in the parser worker."""
import importlib
import json
import logging
import sys
from pathlib import Path


def test_logger_produces_json(capsys):
    from services.logger import get_logger

    logger = get_logger("parser.test.shim")
    logger.info("parsed resume")
    record = json.loads(capsys.readouterr().err.strip().splitlines()[-1])
    assert record["message"] == "parsed resume"
    assert record["logger"] == "parser.test.shim"
    assert isinstance(logger, logging.Logger)


def test_worker_logger_module_is_importable_standalone():
    """services.logger resolves from the single shared copy (see /shared-python/README.md),
    merged into the services namespace package alongside this worker's own services/*.py."""
    module = importlib.import_module("services.logger")
    assert callable(module.get_logger)
    shared_dir = Path(__file__).resolve().parents[3] / "shared-python" / "services"
    assert Path(module.__file__).resolve() == shared_dir / "logger.py"


def test_context_dict_reaches_json_output():
    import io

    from services.logger import get_logger

    logger = get_logger("parser.test.context")
    [handler] = logger.handlers
    buf = io.StringIO()
    handler.setStream(buf)
    logger.info("Processing job done", {"resume_id": "r1"})
    record = json.loads(buf.getvalue())
    assert record["message"] == "Processing job done"
    assert record["context"] == {"resume_id": "r1"}
