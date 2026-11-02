"""Tests for extractors.name_extractor."""
import pytest

from extractors.name_extractor import _is_likely_name, _is_not_name, _is_valid_name, extract_name


@pytest.mark.parametrize(
    "text, expected",
    [
        # header line followed by contact details
        ("Jane Doe\njane.doe@example.com | (415) 555-0123", "Jane Doe"),
        # explicit label wins
        ("RESUME\nName: Robert O'Neil\nEmail: r@x.com", "Robert O'Neil"),
        ("Full Name: Ana-Maria Lopez", "Ana-Maria Lopez"),
        ("Candidate Name : Wei Zhang", "Wei Zhang"),
        # contact lines first, name later (strategy 2 skips email/phone lines)
        ("john@example.com\n555-123-4567\nJohn Smith", "John Smith"),
        # middle initial with digits elsewhere is still allowed
        ("Professional Summary\nObjective: get a job\n12345\nJohn A. Doe Jr", "John A. Doe Jr"),
        # first line, followed by a title
        ("Priya Sharma\nSenior Engineer", "Priya Sharma"),
        # short noise lines skipped, falls through to title-case strategies
        ("Hi\nab\nPriya Sharma\nBengaluru", "Priya Sharma"),
        # leading whitespace / blank lines ignored
        ("\n\n   Carlos Mendes   \n+55 11 91234 5678", "Carlos Mendes"),
    ],
)
def test_extract_name(text, expected):
    assert extract_name(text) == expected


@pytest.mark.parametrize("text", ["", None, "\n \n", "SKILLS\nEXPERIENCE", "jane@x.com\n555-123-4567"])
def test_extract_name_returns_none_when_no_candidate(text):
    assert extract_name(text) is None


def test_label_with_invalid_value_is_ignored():
    # "Name: Resume" is rejected by validation; falls through to the header line
    assert extract_name("Name: Resume\nMaria Garcia") == "Maria Garcia"


def test_all_caps_name_only_matched_via_title_case_rule():
    # all-caps isn't title case -> not detected by any strategy
    assert extract_name("JANE DOE\njane@x.com") == "JANE DOE"


@pytest.mark.xfail(
    reason="BUG: name_extractor.py:30-41 (strategy 2) only filters with _is_not_name, whose header list "
    "lacks 'resume'/'curriculum vitae' (those are only in _is_valid_name), so a 'Curriculum Vitae' "
    "title line is returned as the candidate's name.",
    strict=True,
)
def test_document_title_is_not_returned_as_name():
    assert extract_name("Curriculum Vitae\nMaria Garcia Lopez\nmaria@x.com") == "Maria Garcia Lopez"


# --------------------------------------------------------------------------- helpers


@pytest.mark.parametrize(
    "value, ok",
    [
        ("Jane Doe", True),
        ("J", False),
        ("", False),
        ("One Two Three Four Five Six", False),
        ("Professional Summary", False),
        ("1234 5678", False),
        ("--- ...", False),
    ],
)
def test_is_valid_name(value, ok):
    assert _is_valid_name(value) is ok


@pytest.mark.parametrize(
    "line, not_name",
    [
        ("jane@x.com", True),
        ("(415) 555-0123", True),
        ("+919876543210", True),
        ("https://janedoe.dev", True),
        ("linkedin.com/in/jane", True),
        ("x" * 61, True),
        ("Apt 42 Main Street", True),
        ("Work Experience", True),
        ("Jane Doe", False),
        ("John A. Doe 3rd", False),
    ],
)
def test_is_not_name(line, not_name):
    assert _is_not_name(line) is not_name


def test_is_likely_name_requires_word_count_case_and_letters():
    assert _is_likely_name("Jane", 0, ["Jane"]) is False
    assert _is_likely_name("jane doe smith", 0, ["jane doe smith"]) is False
    assert _is_likely_name("Jane D0e", 0, ["Jane D0e"]) is False
    assert _is_likely_name("Jane Doe", 3, ["a", "b", "c", "Jane Doe"]) is False  # no context, not first
    assert _is_likely_name("Jane Doe", 3, ["a", "b", "c", "Jane Doe", "+1 555"]) is True
    assert _is_likely_name("Jane Doe", 0, ["Jane Doe"]) is True
