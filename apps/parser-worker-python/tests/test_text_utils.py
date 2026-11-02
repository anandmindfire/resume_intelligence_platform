"""Tests for utils.text_utils."""
from utils.text_utils import extract_bullet_points, extract_sentences, remove_urls, split_into_sections


def test_split_into_sections_groups_lines_under_headers(sample_resume):
    sections = split_into_sections(sample_resume)
    assert {"experience", "education", "projects", "certifications"} <= set(sections)
    assert "Acme Corp" in sections["experience"]
    assert "GPA: 3.8" in sections["education"]
    assert "Resume Parser | Python, spaCy, Redis" in sections["projects"]


def test_split_into_sections_ignores_preamble_before_first_header():
    sections = split_into_sections("Jane Doe\njane@x.com\nSkills\nPython\nGo")
    assert sections == {"skills": "Python\nGo"}


def test_split_into_sections_no_headers():
    assert split_into_sections("just some text\nmore text") == {}


def test_split_into_sections_any_line_containing_keyword_starts_new_section():
    # A content line mentioning "tools" is treated as a header (documented heuristic)
    sections = split_into_sections("Experience\nBuilt internal tools\nShipped v2")
    assert sections == {"experience": "", "skills": "Shipped v2"}


def test_split_into_sections_later_duplicate_header_overwrites():
    sections = split_into_sections("Skills\nPython\nEducation\nBS\nSkills\nGo")
    assert sections["skills"] == "Go"
    assert sections["education"] == "BS"


def test_extract_sentences():
    assert extract_sentences("Led a team. Shipped v2! Why? ") == ["Led a team", "Shipped v2", "Why"]
    assert extract_sentences("") == []
    assert extract_sentences("...") == []


def test_remove_urls():
    text = "Portfolio: https://jane.dev/work?x=1 and http://example.com end"
    assert remove_urls(text) == "Portfolio:  and  end"
    assert remove_urls("no links here") == "no links here"


def test_extract_bullet_points_supports_common_markers():
    text = "\n".join([
        "Header line",
        "• Bullet dot",
        "- Dash item",
        "* Star item",
        "1. First numbered",
        "2) Second numbered",
        "  ◦ Indented hollow bullet",
        "Not a bullet",
    ])
    assert extract_bullet_points(text) == [
        "Bullet dot", "Dash item", "Star item", "First numbered", "Second numbered", "Indented hollow bullet",
    ]


def test_extract_bullet_points_empty():
    assert extract_bullet_points("") == []
