"""Tests for the constants package (re-exports and config contract)."""
import constants
from constants import config


def test_package_reexports_every_config_value():
    assert constants.__all__
    for name in constants.__all__:
        assert getattr(constants, name) == getattr(config, name)


def test_consumes_queue_that_ocr_worker_produces_to():
    # OCR worker pushes to "parser-queue" (ocr constants.PARSER_QUEUE_NAME)
    assert constants.QUEUE_NAME == "parser-queue"


def test_status_values_are_distinct_lowercase_strings():
    assert constants.STATUS_PARSED != constants.STATUS_FAILED
    assert constants.STATUS_PARSED.islower() and constants.STATUS_FAILED.islower()


def test_matcher_url_composes_cleanly():
    url = constants.UPLOAD_SERVICE_URL_DEFAULT + constants.MATCHER_ENDPOINT_PATH
    assert url.startswith("http://") and "//api" not in url
    assert constants.MATCHER_ENDPOINT_PATH.startswith("/")


def test_numeric_defaults():
    assert isinstance(constants.REDIS_PORT_DEFAULT, int)
    assert constants.PARSER_WORKER_CONCURRENCY_DEFAULT >= 1
