"""Tests for processors.resume_parser.ResumeParser."""
from unittest.mock import MagicMock

import pytest

from processors import resume_parser as rp_module
from processors.resume_parser import ResumeParser

EXPECTED_KEYS = {"name", "email", "phone", "skills", "experience", "education", "projects",
                 "achievements", "rawText"}


def test_parse_realistic_resume_end_to_end(sample_resume):
    data = ResumeParser().parse(sample_resume)

    assert set(data) == EXPECTED_KEYS
    assert data["name"] == "Jane Doe"
    assert data["email"] == "jane.doe@example.com"
    assert data["phone"] == "(415) 555-0123"  # normalised
    assert {"Python", "Redis"} <= set(data["skills"])

    titles = [e["title"] for e in data["experience"]]
    assert titles == ["Senior Software Engineer", "Backend Developer"]
    assert data["experience"][0]["company"] == "Acme Corp"
    assert data["experience"][1]["company"] == "Acme Labs"

    [edu] = data["education"]
    assert edu["institution"] == "Stanford University"
    assert edu["gpa"] == "3.8"

    assert data["projects"][0]["title"] == "Resume Parser"
    assert [a["type"] for a in data["achievements"]] == ["certification", "award"]
    assert data["rawText"].startswith("Jane Doe\njane.doe@example.com")


def test_parse_empty_text_returns_empty_structure():
    assert ResumeParser().parse("") == {
        "name": "", "email": "", "phone": "", "skills": [], "experience": [], "education": [],
        "projects": [], "achievements": [], "rawText": "",
    }


def test_parse_garbage_text_does_not_crash():
    data = ResumeParser().parse("@@@ ### \x00\x01 12 34\n\n\n%%%")
    assert set(data) == EXPECTED_KEYS
    assert data["email"] == "" and data["phone"] == ""


@pytest.fixture
def stub_extractors(monkeypatch):
    stubs = {}
    for name, value in {
        "extract_email": "  Jane@Example.COM ",
        "extract_phone": "4155550123",
        "extract_name": None,
        "extract_skills": ["Python"],
        "extract_experience": [],
        "extract_education": [],
        "extract_projects": [],
        "extract_achievements": [],
    }.items():
        stubs[name] = MagicMock(name=name, return_value=value)
        monkeypatch.setattr(rp_module, name, stubs[name])
    return stubs


def test_parse_normalises_text_before_extraction_and_contact_after(stub_extractors):
    data = ResumeParser().parse("  Jane    Doe \n\n\n\nPython  ")
    for stub in stub_extractors.values():
        stub.assert_called_once_with("Jane Doe\n\nPython")
    assert data["email"] == "jane@example.com"
    assert data["phone"] == "(415) 555-0123"
    assert data["name"] == ""  # None from extractor is coerced to ""


def test_parse_handles_missing_contact_info(stub_extractors):
    stub_extractors["extract_email"].return_value = None
    stub_extractors["extract_phone"].return_value = None
    data = ResumeParser().parse("text")
    assert data["email"] == "" and data["phone"] == ""
