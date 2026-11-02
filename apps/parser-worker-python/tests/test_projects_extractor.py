"""Tests for extractors.projects_extractor."""
import pytest

from extractors.projects_extractor import (
    _contains_date,
    _extract_date_range,
    _extract_technologies,
    _is_project_title,
    _is_url,
    _split_title_and_technologies,
    extract_projects,
)


@pytest.mark.parametrize("text", ["", None, "Experience\nEngineer\nAcme", "Projects\n"])
def test_no_projects(text):
    assert extract_projects(text) == []


def test_project_with_inline_technologies_description_and_url():
    text = (
        "Projects\n"
        "Resume Parser | Python, spaCy, Redis\n"
        "built a pipeline that extracts structured data from resumes\n"
        "https://github.com/janedoe/resume-parser\n"
    )
    assert extract_projects(text) == [{
        "title": "Resume Parser",
        "description": "built a pipeline that extracts structured data from resumes",
        "technologies": ["Python", "spaCy", "Redis"],
        "url": "https://github.com/janedoe/resume-parser",
        "duration": None,
    }]


def test_numbered_projects_and_bare_www_url():
    text = "Projects\n1. Weather Bot\n2. Budget Tracker\nwww.example.com/budget"
    projects = extract_projects(text)
    assert [p["title"] for p in projects] == ["1. Weather Bot", "2. Budget Tracker"]
    assert projects[1]["url"] == "www.example.com/budget"
    assert projects[0]["url"] is None


def test_title_with_using_keyword_splits_trailing_tech():
    [proj] = extract_projects("Personal Projects\nInventory System using Flask, Postgres\nhttps://gitlab.com/x/inv")
    assert proj["title"] == "Inventory System using Flask"
    assert proj["technologies"] == ["Postgres"]
    assert proj["url"] == "https://gitlab.com/x/inv"


def test_lowercase_tech_and_duration_lines_attach_to_project():
    text = "Projects\nChat App\nbuilt with: react, node.js\n2021 - 2022\nreal-time messaging for teams\n"
    [proj] = extract_projects(text)
    assert proj["technologies"] == ["react", "node.js"]
    assert proj["duration"] == "2021 - 2022"
    assert proj["description"] == "real-time messaging for teams"


def test_url_before_any_project_is_ignored():
    assert extract_projects("Projects\nhttps://github.com/me\n") == []


@pytest.mark.xfail(
    reason="BUG: projects_extractor.py:32-35 appends the current project when the next section starts, "
    "and lines 89-90 append it again after the loop, so the last project is duplicated whenever "
    "another section follows Projects.",
    strict=True,
)
def test_last_project_not_duplicated_when_followed_by_section():
    text = "Projects\nResume Parser | Python\nbuilt a parsing pipeline for resumes\n\nEducation\nB.S."
    assert len(extract_projects(text)) == 1


@pytest.mark.xfail(
    reason="BUG: projects_extractor.py:113 treats any line starting with a capitalised word as a new "
    "project title, so normal description/tech lines ('Built with: React, Node.js') start bogus projects.",
    strict=True,
)
def test_capitalised_tech_line_belongs_to_current_project():
    projects = extract_projects("Projects\nChat App\nBuilt with: React, Node.js, Socket.io\n")
    assert len(projects) == 1
    assert projects[0]["technologies"] == ["React", "Node.js", "Socket.io"]


# --------------------------------------------------------------------------- helpers


def test_is_project_title():
    lines = ["Chat App", "A long description line follows here"]
    assert _is_project_title("Chat App", 0, lines)
    assert _is_project_title("1. Tool", 0, ["1. Tool"])
    assert not _is_project_title("1. tool", 0, ["1. tool"])
    assert _is_project_title("API GATEWAY", 0, ["API GATEWAY"])
    assert not _is_project_title("x" * 121, 0, [])
    assert not _is_project_title("e this is an ocr bullet artifact line", 0, [])
    assert not _is_project_title("lowercase line", 0, ["lowercase line"])
    assert _is_project_title("my tool, using react", 0, []) is False  # lowercase title part


def test_split_title_and_technologies():
    assert _split_title_and_technologies("Site | React; Next") == {"title": "Site", "technologies": ["React", "Next"]}
    assert _split_title_and_technologies("Bot built with Python") == {"title": "Bot built with", "technologies": ["Python"]}
    assert _split_title_and_technologies("Plain Title") == {"title": "Plain Title", "technologies": []}
    assert _split_title_and_technologies("using lowercase only") == {"title": "using lowercase only", "technologies": []}


def test_is_url():
    assert _is_url("https://a.b/c") and _is_url("see www.site.io") and _is_url("github.com/me/repo")
    assert not _is_url("no link")


def test_extract_technologies():
    assert _extract_technologies("Technologies: Go; gRPC • Kafka") == ["Go", "gRPC", "Kafka"]


def test_date_helpers():
    assert _contains_date("2021") and _contains_date("Mar 2020") and not _contains_date("v2")
    assert _extract_date_range("Jan 2020 - Present") == "Jan 2020 - Present"
    assert _extract_date_range("Shipped 06/2021") == "06/2021"
    assert _extract_date_range("Summer of '19") is None


def test_ocr_bullet_artifact_lines_are_appended_to_description():
    text = "Projects\nChat App\ne realtime messaging for distributed teams\no supports offline sync and push\n"
    [proj] = extract_projects(text)
    assert proj["description"] == "realtime messaging for distributed teams supports offline sync and push"
