"""Tests for the TypedDict models -- they should describe what the code actually produces."""
from typing import get_type_hints

from models import HealthStatus, ParsedResumeData, ParserJobData, ParserResult
from processors.resume_parser import ResumeParser


def test_job_model_matches_ocr_payload_fields_used():
    assert set(get_type_hints(ParserJobData)) == {"resumeId", "extractedText"}


def test_parsed_model_fields_are_all_produced_by_parser():
    produced = set(ResumeParser().parse("Jane Doe\njane@example.com"))
    assert set(get_type_hints(ParsedResumeData)) <= produced


def test_result_and_health_models():
    assert {"resumeId", "parsedData", "status"} <= set(get_type_hints(ParserResult))
    assert set(get_type_hints(HealthStatus)) == {"status", "checks"}
