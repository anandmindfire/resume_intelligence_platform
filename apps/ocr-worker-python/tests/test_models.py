"""Tests for the TypedDict models."""
from typing import get_type_hints

from models import HealthStatus, OCRJobData, OCRResult


def test_job_model_matches_keys_consumed_by_worker():
    assert set(get_type_hints(OCRJobData)) == {"resumeId", "filePath", "fileName", "mimeType"}


def test_result_model_covers_worker_result_keys():
    # main.process_ocr_job returns resumeId/extractedText/status
    assert {"resumeId", "extractedText", "status"} <= set(get_type_hints(OCRResult))


def test_health_model_shape():
    assert set(get_type_hints(HealthStatus)) == {"status", "checks"}
