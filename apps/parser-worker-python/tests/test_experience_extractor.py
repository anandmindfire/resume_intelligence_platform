"""Tests for extractors.experience_extractor."""
from datetime import datetime

import pytest

from extractors.experience_extractor import (
    _calculate_duration,
    _contains_date,
    _extract_bullet_text,
    _extract_date_info,
    _extract_technologies,
    _is_bullet_point,
    _is_job_title,
    _is_location,
    _parse_comma_separated_entry,
    _parse_pipe_formatted_entry,
    _remove_date_from_line,
    extract_experience,
)


@pytest.mark.parametrize("text", ["", None, "Summary only\nNo jobs here", "Jane Doe\nSoftware Engineer\nAcme"])
def test_no_experience_section_returns_empty(text):
    assert extract_experience(text) == []


def test_stacked_title_company_location_dates_format(sample_resume):
    first = extract_experience(sample_resume)[0]
    years = datetime.now().year - 2020
    assert first == {
        "title": "Senior Software Engineer",
        "company": "Acme Corp",
        "location": "San Francisco, CA",
        "startDate": "Jan 2020",
        "endDate": "Present",
        "duration": f"{years} years",
        "description": "",
        "responsibilities": [
            "Led migration of monolith to microservices on Kubernetes",
            "Reduced p99 latency by 40%",
        ],
        "technologies": ["Python", "Go", "PostgreSQL", "Redis"],
    }


def test_company_first_pipe_format():
    text = "Work Experience\nAcme Corp | Backend Developer | Remote | 2018 - 2021\n- Built stuff\nEducation\nB.S."
    [exp] = extract_experience(text)
    assert (exp["company"], exp["title"], exp["location"]) == ("Acme Corp", "Backend Developer", "Remote")
    assert (exp["startDate"], exp["endDate"], exp["duration"]) == ("2018", "2021", "3 years")
    assert exp["responsibilities"] == ["Built stuff"]


def test_comma_separated_format_and_section_stop():
    text = (
        "EXPERIENCE\n"
        "Data Analyst, Initech, Austin, TX, 2015 - 2018\n"
        "* Automated reports\n"
        "SKILLS\n"
        "Analyst, Ignored Corp, 2020 - 2021"
    )
    [exp] = extract_experience(text)
    assert (exp["title"], exp["company"]) == ("Data Analyst", "Initech")
    assert (exp["startDate"], exp["endDate"]) == ("2015", "2018")
    assert exp["responsibilities"] == ["Automated reports"]


def test_description_numbered_bullets_and_separate_date_lines():
    text = (
        "Experience:\n"
        "Product Manager\n"
        "Hooli\n"
        "2016\n"
        "2019\n"
        "Owned roadmap for search products across three teams\n"
        "1. Shipped feature X\n"
        "2) Grew DAU 2x\n"
    )
    [exp] = extract_experience(text)
    assert (exp["title"], exp["company"]) == ("Product Manager", "Hooli")
    assert (exp["startDate"], exp["endDate"]) == ("2016", "2019")
    assert exp["description"] == "Owned roadmap for search products across three teams"
    assert exp["responsibilities"] == ["Shipped feature X", "Grew DAU 2x"]


def test_ocr_bullet_artifacts_become_responsibilities():
    text = "Experience\nSoftware Engineer\nAcme\ne Wrote lots of backend code for things"
    [exp] = extract_experience(text)
    assert exp["responsibilities"] == ["Wrote lots of backend code for things"]


def test_multiple_jobs_and_deduplication():
    text = (
        "Professional Experience\n"
        "Software Engineer\nAcme\n- a thing that was done\n\n"
        "Junior Developer\nGlobex\n- another thing\n\n"
        "Software Engineer\nAcme\n"
    )
    exps = extract_experience(text)
    assert [(e["title"], e["company"]) for e in exps] == [
        ("Software Engineer", "Acme"),
        ("Junior Developer", "Globex"),
    ]


def test_title_with_inline_date_range():
    text = "Experience\nLead Engineer 2019 - Present\nInitrode\n"
    [exp] = extract_experience(text)
    assert exp["title"] == "Lead Engineer"
    assert exp["startDate"] == "Engineer 2019"  # see xfail below: preceding word captured
    assert exp["endDate"] == "Present"


def test_technology_line_is_collected():
    text = "Experience\nDevOps Engineer\nAcme\nusing terraform; ansible; jenkins\n"
    [exp] = extract_experience(text)
    assert exp["technologies"] == ["terraform", "ansible", "jenkins"]


@pytest.mark.xfail(
    reason="BUG: experience_extractor.py:430-439 -- in 'Title | Company | Dates' lines the title is "
    "matched first, then the company at index 1 is only assigned when no title exists, so company is "
    "lost (the docstring format 'Company | Title' works).",
    strict=True,
)
def test_title_first_pipe_format_keeps_company():
    [exp] = extract_experience("Experience\nSoftware Engineer | Globex Inc | 2017 - 2019\n")
    assert exp["company"] == "Globex Inc"


@pytest.mark.xfail(
    reason="BUG: experience_extractor.py:121-131 -- the 'company' branch runs before the bullet branch, "
    "so when a title line is directly followed by a bullet, the bullet text ('- Built REST APIs') is "
    "stored as the company and dropped from responsibilities.",
    strict=True,
)
def test_bullet_after_title_is_not_used_as_company():
    [exp] = extract_experience("Experience\nSoftware Engineer | 2017 - 2019\n- Built REST APIs\n- Mentored interns\n")
    assert exp["company"] is None
    assert exp["responsibilities"] == ["Built REST APIs", "Mentored interns"]


@pytest.mark.xfail(
    reason="BUG: experience_extractor.py:260 (and education_extractor.py:293) use (\\w+\\s+\\d{4}) for "
    "'Month YYYY', which captures ANY preceding word, e.g. 'Engineer 2019' becomes the start date.",
    strict=True,
)
def test_date_range_start_does_not_capture_arbitrary_word():
    assert _extract_date_info("Lead Engineer 2019 - Present")["start"] == "2019"


@pytest.mark.xfail(
    reason="BUG: experience_extractor.py:39-47 treats any line starting with a single letter + space as "
    "an OCR bullet artifact and strips it, so sentences starting with 'I' or 'A' lose their first word.",
    strict=True,
)
def test_sentences_starting_with_a_or_i_keep_first_word():
    [exp] = extract_experience("Experience\nSoftware Engineer\nAcme\nI led a team of five engineers on payments\n")
    assert "I led a team of five engineers on payments" in exp["responsibilities"] + [exp["description"]]


# --------------------------------------------------------------------------- helpers


@pytest.mark.parametrize(
    "line, expected",
    [
        ("Senior Software Engineer", True),
        ("Data Scientist", True),
        ("Developed a payments engine", False),  # starts with action verb
        ("- Lead developer", False),  # bullet
        ("e engineer artifacts", False),
        ("Acme Corporation", False),
        ("x" * 121 + " engineer", False),
    ],
)
def test_is_job_title(line, expected):
    assert _is_job_title(line) is expected


def test_is_job_title_lowercase_needs_following_company_line():
    assert _is_job_title("software engineer", 0, ["software engineer", "Acme"]) is True
    assert _is_job_title("software engineer", 0, ["software engineer", "Developed things"]) is False
    assert _is_job_title("software engineer", 0, ["software engineer"]) is False


@pytest.mark.parametrize(
    "line, expected",
    [
        ("Jan 2020 - Present", True),
        ("2019", True),
        ("03/2016", True),
        ("Reduced costs by 2020%", False),
        ("Handled 3050 tickets", False),
        ("No dates here", False),
    ],
)
def test_contains_date(line, expected):
    assert _contains_date(line) is expected


def test_extract_date_info_variants():
    assert _extract_date_info("2017 - 2019") == {"start": "2017", "end": "2019", "duration": "2 years"}
    assert _extract_date_info("Jan 2020 – Dec 2020") == {
        "start": "Jan 2020", "end": "Dec 2020", "duration": "Less than 1 year",
    }
    assert _extract_date_info("2019 - current")["end"] == "Present"
    assert _extract_date_info("since 03/2016") == {"start": "03/2016", "end": None, "duration": None}
    assert _extract_date_info("1850 - 1860") is None
    assert _extract_date_info("nothing") is None


@pytest.mark.parametrize(
    "start, end, expected",
    [
        ("2019", "2020", "1 year"),
        ("2015", "2018", "3 years"),
        ("2020", "2020", "Less than 1 year"),
        ("2020", "2018", None),
        ("Jan", "2018", None),
        ("2018", "soon", None),
    ],
)
def test_calculate_duration(start, end, expected):
    assert _calculate_duration(start, end) == expected


def test_calculate_duration_present_uses_current_year():
    assert _calculate_duration("2000", "Present") == f"{datetime.now().year - 2000} years"


def test_calculate_duration_swallows_errors():
    assert _calculate_duration(None, "2020") is None


@pytest.mark.parametrize(
    "line, expected",
    [("San Francisco, CA", True), ("Remote", True), ("Austin, Texas", True), ("Acme Corp", False)],
)
def test_is_location(line, expected):
    assert _is_location(line) is expected


def test_extract_technologies_strips_prefixes_and_noise():
    assert _extract_technologies("Built with: React, Node | x") == ["React", "Node"]


def test_remove_date_from_line():
    assert _remove_date_from_line("Engineer 2019 - Present") == "Engineer"
    assert _remove_date_from_line("Analyst Jan 2020") == "Analyst"
    assert _remove_date_from_line("Dev 03/2016") == "Dev"


@pytest.mark.parametrize(
    "line, bullet",
    [("• item", True), ("- item", True), ("* item", True), ("1. item", True), ("a) item", True),
     ("▪ item", True), ("→ item", True), ("Item", False), ("-item", False)],
)
def test_is_bullet_point(line, bullet):
    assert _is_bullet_point(line) is bullet


def test_extract_bullet_text():
    assert _extract_bullet_text("• Shipped it") == "Shipped it"
    assert _extract_bullet_text("12) Shipped it") == "Shipped it"
    assert _extract_bullet_text("B. Shipped it") == "Shipped it"


def test_parse_pipe_entry_needs_company_or_title():
    assert _parse_pipe_formatted_entry(["only"], 0, []) is None
    assert _parse_pipe_formatted_entry(["", "2019 - 2020"], 0, []) is None
    entry = _parse_pipe_formatted_entry(["Acme", "Remote", "Platform"], 0, [])
    # third unrecognised part becomes the title once location is known
    assert (entry["company"], entry["location"], entry["title"]) == ("Acme", "Remote", "Platform")


def test_parse_pipe_entry_third_part_fallbacks():
    entry = _parse_pipe_formatted_entry(["Acme", "", "Platform"], 0, [])
    assert entry["location"] == "Platform"


def test_parse_comma_entry_requires_title():
    assert _parse_comma_separated_entry("Acme, Globex", 0, []) is None
    assert _parse_comma_separated_entry("no commas", 0, []) is None
    entry = _parse_comma_separated_entry("Engineer, Level IV, Acme", 0, [])
    assert (entry["title"], entry["company"]) == ("Engineer", "Acme")
