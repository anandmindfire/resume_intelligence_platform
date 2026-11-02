"""Tests for extractors.skills_extractor."""
import pytest

from extractors.skills_extractor import TECHNICAL_SKILLS, _extract_skills_section, extract_skills


@pytest.mark.parametrize("text", ["", None])
def test_empty(text):
    assert extract_skills(text) == []


def test_skills_section_with_known_skills():
    text = "Jane Doe\n\nSkills\nPython, Docker, Kubernetes\nAWS and PostgreSQL\n\nExperience\nUsed Java daily"
    skills = extract_skills(text)
    assert {"Python", "Docker", "Kubernetes", "Aws", "Postgresql"} <= set(skills)
    # outside the skills section -> not searched when a section exists
    assert "Java" not in skills


def test_free_text_is_searched_when_there_is_no_skills_section():
    skills = extract_skills("I love python and machine learning and React Native apps")
    assert skills == ["Machine Learning", "Python", "React", "React Native"]


def test_matching_uses_word_boundaries():
    # "javascript" must not also yield "java"; "goal" must not yield "go"
    assert extract_skills("Strong javascript background, goal oriented") == ["Javascript"]


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


@pytest.mark.xfail(
    reason="BUG: skills_extractor.py:53 wraps every skill in \\b...\\b; for skills ending in a non-word "
    "char ('c++', 'c#') the trailing \\b can never match before a space/comma/EOL, so C++ and C# are "
    "never detected from a skills section.",
    strict=True,
)
def test_detects_cpp_and_csharp_in_skills_section():
    skills = extract_skills("Technical Skills\nC++, C#, Python\nExperience\nDeveloper")
    assert {"C++", "C#", "Python"} <= set(skills)


@pytest.mark.xfail(
    reason="BUG: skills_extractor.py:78 starts the 'skills section' at the FIRST line containing "
    "'skills'/'technologies'/'tools' anywhere (e.g. a 'Technologies:' line inside Experience) and "
    "stops at the next section header, so the real Skills section later in the resume is never searched.",
    strict=True,
)
def test_real_skills_section_is_used_even_if_experience_mentions_technologies(sample_resume):
    text = sample_resume + "\nSkills\nDocker, Kubernetes, AWS, React\n"
    assert {"Docker", "Kubernetes", "React"} <= set(extract_skills(text))


@pytest.mark.xfail(
    reason="BUG: skills_extractor.py:62 splits labeled skill lists on '-' as well as ',', so hyphenated "
    "skills are shredded: 'Skills: Scikit-Learn' yields bogus 'Scikit' and 'Learn' entries.",
    strict=True,
)
def test_hyphenated_skill_is_not_split():
    skills = extract_skills("Skills: Python, Scikit-Learn")
    assert "Learn" not in skills and "Scikit" not in skills
