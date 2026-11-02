"""Tests for extractors.education_extractor."""
import pytest

from extractors.education_extractor import (
    _contains_date,
    _contains_gpa,
    _extract_date,
    _extract_gpa,
    _is_degree,
    _is_honors,
    _is_institution,
    _is_location,
    _looks_like_institution,
    _remove_date_from_line,
    _split_degree_and_institution,
    extract_education,
)


@pytest.mark.parametrize("text", ["", None, "no section here\nBachelor of Science", "Education\n"])
def test_no_education_returns_empty(text):
    assert extract_education(text) == []


def test_single_line_degree_with_details():
    text = "Education\nB.S. in Computer Science, Stanford University, 2017\nGPA: 3.8\nDean's List\nPalo Alto, CA"
    assert extract_education(text) == [{
        "degree": "B.S. in Computer Science",
        "institution": "Stanford University",
        "location": "Palo Alto, CA",
        "graduationDate": "2017",
        "field": None,
        "gpa": "3.8",
        "honors": "Dean's List",
    }]


def test_institution_line_before_degree_line():
    text = "Education\nMassachusetts Institute of Technology\nMBA\n2017\nExperience\nEngineer"
    [edu] = extract_education(text)
    assert (edu["degree"], edu["institution"], edu["graduationDate"]) == (
        "MBA", "Massachusetts Institute of Technology", "2017",
    )


def test_multiple_degrees_and_cgpa():
    text = (
        "Academic Background\n"
        "B.Tech, Indian Institute of Technology Bombay, 2014 - 2018\n"
        "CGPA: 9.1\n"
        "Diploma in Design, National Institute of Design\n"
    )
    edus = extract_education(text)
    assert [e["degree"] for e in edus] == ["B.Tech", "Diploma in Design"]
    assert edus[0]["institution"] == "Indian Institute of Technology Bombay"
    assert edus[0]["graduationDate"] == "2014 - 2018"
    assert edus[0]["gpa"] == "9.1"
    assert edus[1]["institution"] == "National Institute of Design"


def test_stops_at_next_section():
    text = "Education\nB.S. Physics, Ohio State University, 2012\nSkills\nM.S. Chemistry, Other University, 2014"
    assert [e["degree"] for e in extract_education(text)] == ["B.S. Physics"]


def test_degree_with_field_after_comma_and_no_institution():
    [edu] = extract_education("Education\nB.S., Computer Science, 2016\n")
    assert edu["degree"] == "B.S."
    assert edu["field"] == "Computer Science"
    assert edu["institution"] is None


def test_duplicate_entries_are_removed():
    text = "Education\nB.A. Economics, Yale University, 2010\nB.A. Economics, Yale University, 2010\n"
    assert len(extract_education(text)) == 1


@pytest.mark.xfail(
    reason="BUG: education_extractor.py:47-53 checks 'is institution' before 'is degree', and "
    "_looks_like_institution() is true for any 2-8 word line containing 'of' or mostly capitalised "
    "words -- so undated degree lines like 'Bachelor of Science, Computer Science', 'M.S. Computer "
    "Science' or 'B.S. Physics, Ohio State University' are stored as the institution and no degree is "
    "ever recorded (the entry is then discarded). Only lines that also contain a year survive.",
    strict=True,
)
@pytest.mark.parametrize("text", [
    "Education\nBachelor of Science, Computer Science\nStanford University\n2017",
    "Education\nM.S. Computer Science\n2019",
    "Education\nB.S. Physics, Ohio State University\nGPA: 3.5",
], ids=["bachelor-of", "title-case-abbrev", "undated-degree-and-school"])
def test_common_degree_lines_are_recognised(text):
    edus = extract_education(text)
    assert len(edus) == 1 and edus[0]["degree"]


def test_short_institution_line_is_picked_up_by_lookback():
    # "Stanford University" (<30 chars) is consumed as a header, but the degree line looks back one line
    [edu] = extract_education("Education\nStanford University\nB.S. Computer Science, 2017\n")
    assert edu["institution"] == "Stanford University"
    assert edu["graduationDate"] == "2017"


@pytest.mark.xfail(
    reason="BUG: education_extractor.py:79,100-102 seeds the next degree with the previous entry's "
    "institution and prefers it over the institution parsed from the degree line, so a second degree "
    "inherits the first school (e.g. M.Tech at 'IIT Delhi' recorded as IIT Bombay).",
    strict=True,
)
def test_second_degree_does_not_inherit_previous_institution():
    text = "Education\nB.Tech, Indian Institute of Technology Bombay, 2018\nM.Tech, IIT Delhi, 2020\n"
    edus = extract_education(text)
    assert edus[1]["institution"] == "IIT Delhi"


@pytest.mark.xfail(
    reason="BUG: education_extractor.py:293 date-range regex (\\w+\\s+\\d{4}) captures the word before "
    "the year, so 'MBA 2015 - 2017' yields graduationDate 'MBA 2015 - 2017'.",
    strict=True,
)
def test_graduation_date_excludes_degree_text():
    [edu] = extract_education("Education\nHarvard Business School\nMBA 2015 - 2017\n")
    assert edu["graduationDate"] == "2015 - 2017"


# --------------------------------------------------------------------------- helpers


@pytest.mark.parametrize(
    "line, expected",
    [
        ("Bachelor of Arts", True), ("MBA", True), ("Ph.D. Physics", True), ("B.Tech", True),
        ("High School Diploma", True), ("BS Computer Science", True), ("Stanford University", False),
        ("Software Engineer", False),
    ],
)
def test_is_degree(line, expected):
    assert _is_degree(line) is expected


def test_institution_heuristics():
    assert _is_institution("Ohio State University")
    assert _is_institution("Delhi Public School")
    assert not _is_institution("Acme Corp")
    assert _looks_like_institution("University of Texas at Austin")
    assert _looks_like_institution("Carnegie Mellon")
    assert not _looks_like_institution("MIT")
    assert not _looks_like_institution("one two three four five six seven eight nine")
    assert not _looks_like_institution("graduated with honours")


def test_location_gpa_honors_helpers():
    assert _is_location("Austin, TX") and _is_location("Paris, Ile, France")
    assert not _is_location("Austin")
    assert _contains_gpa("GPA: 3.9/4.0") and _contains_gpa("Grade Point Average: 3.2")
    assert not _contains_gpa("Graduated 2019")
    assert _extract_gpa("GPA: 3.9/4.0") == "3.9"
    assert _extract_gpa("CGPA 8.7") == "8.7"
    assert _extract_gpa("Grade Point Average: 3.2") is None
    assert _is_honors("Magna Cum Laude") and _is_honors("Merit scholarship recipient")
    assert not _is_honors("Computer Science")


def test_date_helpers():
    assert _contains_date("May 2019") and _contains_date("2019")
    assert not _contains_date("Top 5%") and not _contains_date("Room 3050")
    assert _extract_date("2014 - 2018") == "2014 - 2018"
    assert _extract_date("Graduated May 2019") == "may 2019"
    assert _extract_date("1850 - 1854") is None
    assert _extract_date("Class of 1850") is None
    assert _extract_date("none") is None
    assert _remove_date_from_line("B.S. Physics, 2014 - 2018") == "B.S. Physics"
    assert _remove_date_from_line("MBA | May 2019") == "MBA"


def test_split_degree_and_institution():
    assert _split_degree_and_institution("B.S. Physics, Ohio State University") == {
        "degree": "B.S. Physics", "institution": "Ohio State University",
    }
    # without a separator the fallback regex can't isolate the institution
    assert _split_degree_and_institution("MBA Harvard Business School") == {
        "degree": "MBA Harvard Business School", "institution": None,
    }
    assert _split_degree_and_institution("Diploma") == {"degree": "Diploma", "institution": None}
    assert _split_degree_and_institution("B.S., ab") == {"degree": "B.S., ab", "institution": None}
