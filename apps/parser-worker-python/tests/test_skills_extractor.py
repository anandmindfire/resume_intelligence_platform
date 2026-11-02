"""Tests for extractors.skills_extractor."""
import pytest

from extractors.skills_extractor import TECHNICAL_SKILLS, _extract_skills_section, extract_skills


@pytest.mark.parametrize("text", ["", None])
def test_empty(text):
    assert extract_skills(text) == []


def test_skills_section_with_known_skills():
    text = "Jane Doe\n\nSkills\nPython, Docker, Kubernetes\nAWS and PostgreSQL\n\nExperience\nUsed Java daily"
    skills = extract_skills(text)
    assert {"Python", "Docker", "Kubernetes", "AWS", "PostgreSQL"} <= set(skills)
    # outside the skills section -> not searched when a section exists
    assert "Java" not in skills


def test_free_text_is_searched_when_there_is_no_skills_section():
    skills = extract_skills("I love python and machine learning and React Native apps")
    assert skills == ["Machine Learning", "Python", "React", "React Native"]


def test_matching_uses_word_boundaries():
    # "javascript" must not also yield "java"; "goal" must not yield "go"
    assert extract_skills("Strong javascript background, goal oriented") == ["JavaScript"]


def test_labeled_list_adds_unknown_items():
    skills = extract_skills("Skills: Python; Figma | Jira, Go")
    assert {"Python", "Figma", "Jira"} <= set(skills)
    assert "Go" in skills  # matched from the known-skill list even though it's < 3 chars


def test_labeled_list_ignores_items_of_two_chars_or_fewer():
    assert extract_skills("Tools: vi, ed") == []


def test_results_are_sorted_and_unique():
    skills = extract_skills("Skills: Python, python, PYTHON, Docker")
    assert skills == sorted(set(skills))
    assert skills.count("Python") == 1


def test_known_skills_list_is_lowercase_and_unique():
    assert all(s == s.lower() for s in TECHNICAL_SKILLS)
    assert len(TECHNICAL_SKILLS) == len(set(TECHNICAL_SKILLS))


def test_extract_skills_section_stops_at_next_section():
    text = "Summary\nTechnical Skills\nPython\nGo\nEducation\nBS\n"
    assert _extract_skills_section(text) == "python\ngo"


def test_extract_skills_section_missing():
    assert _extract_skills_section("Jane\nExperience\nEngineer") == ""


def test_detects_cpp_and_csharp_in_skills_section():
    skills = extract_skills("Technical Skills\nC++, C#, Python\nExperience\nDeveloper")
    assert {"C++", "C#", "Python"} <= set(skills)


def test_real_skills_section_is_used_even_if_experience_mentions_technologies(sample_resume):
    text = sample_resume + "\nSkills\nDocker, Kubernetes, AWS, React\n"
    assert {"Docker", "Kubernetes", "React"} <= set(extract_skills(text))


def test_hyphenated_skill_is_not_split():
    skills = extract_skills("Skills: Python, Scikit-Learn")
    assert "Learn" not in skills and "Scikit" not in skills


def test_known_skills_use_canonical_display_names():
    skills = extract_skills("Skills\nNode.js, AWS, PostgreSQL, TensorFlow, CI/CD, GitHub Actions")
    assert {"Node.js", "AWS", "PostgreSQL", "TensorFlow", "CI/CD", "GitHub Actions"} <= set(skills)
    assert "Aws" not in skills and "Node.Js" not in skills


def test_labeled_list_items_use_canonical_names_and_keep_hyphens():
    skills = extract_skills("Skills: Scikit-Learn, Python - Figma")
    assert {"Scikit-learn", "Python", "Figma"} <= set(skills)


@pytest.mark.parametrize("line", ["Skills", "Technical Skills:", "Tools & Technologies", "Key Skills and Tools"])
def test_skills_headings_are_recognised(line):
    assert _extract_skills_section(f"{line}\nPython\nExperience\nx") == "python"


@pytest.mark.parametrize("line", ["Technologies: Python, Go", "Used tools to ship things", "Experience", ""])
def test_non_headings_are_not_skills_sections(line):
    assert _extract_skills_section(f"{line}\nPython") == ""
