"""Tests for the constants package (re-exports and config contract)."""
import constants
from constants import config


def test_package_reexports_every_config_value():
    assert constants.__all__, "constants.__all__ must not be empty"
    for name in constants.__all__:
        assert getattr(constants, name) == getattr(config, name)


def test_mime_types_cover_supported_upload_formats():
    assert constants.MIME_PDF == "application/pdf"
    assert constants.MIME_DOCX.endswith("wordprocessingml.document")
    assert {"image/jpeg", "image/png"} <= set(constants.MIME_TYPES_IMAGE)
    assert constants.MIME_PDF not in constants.MIME_TYPES_IMAGE


def test_queue_names_match_downstream_workers():
    # The parser worker consumes from "parser-queue" (see parser constants)
    assert constants.QUEUE_NAME == "ocr-queue"
    assert constants.PARSER_QUEUE_NAME == "parser-queue"


def test_numeric_defaults_are_sane():
    assert isinstance(constants.REDIS_PORT_DEFAULT, int) and 0 < constants.REDIS_PORT_DEFAULT < 65536
    assert constants.OCR_WORKER_CONCURRENCY_DEFAULT >= 1
    assert constants.OCR_DPI >= 150
