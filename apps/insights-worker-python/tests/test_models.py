"""Tests for the TypedDict models."""
from typing import get_type_hints

from models import HealthStatus, InsightResult, InsightsJobData


def test_job_model():
    assert set(get_type_hints(InsightsJobData)) == {"resumeId", "action"}


def test_result_model_has_status():
    assert {"status", "data", "error"} == set(get_type_hints(InsightResult))


def test_health_model_shape():
    assert set(get_type_hints(HealthStatus)) == {"status", "checks"}
