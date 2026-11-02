"""Tests for extractors.achievements_extractor."""
import pytest

from extractors.achievements_extractor import (
    _classify_achievement_type,
    _contains_date,
    _extract_date,
    _is_achievement_entry,
    _is_issuer,
    extract_achievements,
)


@pytest.mark.parametrize("text", ["", None, "Experience\nEngineer at Acme", "Awards\n"])
def test_no_achievements(text):
    assert extract_achievements(text) == []


def test_numbered_entries_are_classified():
    text = (
        "Certifications\n"
        "1. Certified Kubernetes Administrator (CKA)\n"
        "2. Published paper on graph databases\n"
        "3. Presented talk at PyCon conference\n"
        "4. Achieved top 1% ranking\n"
    )
    items = extract_achievements(text)
    assert [i["type"] for i in items] == ["certification", "publication", "presentation", "achievement"]
    assert items[0]["title"] == "1. Certified Kubernetes Administrator (CKA)"
    assert all(i["date"] is None and i["issuer"] is None for i in items)


def test_entry_with_issuer_date_and_description():
    text = (
        "Honors & Awards\n"
        "- Employee of the Year award\n"
        "Acme Corporation\n"
        "Dec 2020\n"
        "for leading the platform migration to the cloud\n"
    )
    [item] = extract_achievements(text)
    assert item == {
        "title": "- Employee of the Year award",
        "description": "for leading the platform migration to the cloud",
        "date": "dec 2020",
        "issuer": "Acme Corporation",
        "type": "award",
    }


def test_keyword_lines_without_bullets_are_entries_and_descriptions_concatenate():
    text = "Publications\nPublished research article in IEEE journal\nabout scalable systems\nand more detail here\n"
    [item] = extract_achievements(text)
    assert item["type"] == "publication"
    assert item["description"] == "about scalable systems and more detail here"


def test_lines_before_any_entry_are_ignored():
    assert extract_achievements("Awards\nsome loose descriptive text\n") == []


def test_section_ends_at_next_major_section(sample_resume):
    items = extract_achievements(sample_resume)
    assert [i["type"] for i in items] == ["certification", "award"]


@pytest.mark.xfail(
    reason="BUG: achievements_extractor.py:31-34 appends the current entry when the next section starts "
    "and lines 62-63 append it again after the loop, so the last achievement is duplicated whenever "
    "another section follows.",
    strict=True,
)
def test_last_achievement_not_duplicated_when_followed_by_section():
    text = "Awards\n- Employee of the Year award\nSkills\nPython"
    assert len(extract_achievements(text)) == 1


# --------------------------------------------------------------------------- helpers


@pytest.mark.parametrize(
    "line, expected",
    [
        ("• Hackathon", True),
        ("2) Speaker", True),
        ("Winner of state chess championship", True),
        ("Completed marathon", True),
        ("Winner 2019 of things", False),  # contains a date
        ("tiny", False),
        ("Just a sentence without keywords", False),
    ],
)
def test_is_achievement_entry(line, expected):
    assert _is_achievement_entry(line) is expected


@pytest.mark.parametrize(
    "line, kind",
    [
        ("AWS Certified Developer", "certification"),
        ("Professional Engineer License", "certification"),
        ("Hackathon Winner", "award"),
        ("Research paper on NLP", "publication"),
        ("Keynote speaker", "presentation"),
        ("Ran a marathon", "achievement"),
    ],
)
def test_classify_achievement_type(line, kind):
    assert _classify_achievement_type(line) == kind


def test_issuer_and_date_helpers():
    assert _is_issuer("IEEE Computer Society") and _is_issuer("Stanford University")
    assert not _is_issuer("Amazon")
    assert _contains_date("2019") and _contains_date("03/2019") and not _contains_date("Q3")
    assert _extract_date("Awarded 03/2019") == "03/2019"
    assert _extract_date("June 2021") == "june 2021"
    assert _extract_date("none") == ""
