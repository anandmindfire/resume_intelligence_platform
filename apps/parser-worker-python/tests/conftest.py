"""Shared fixtures for the parser worker test suite."""
import pytest


_ENV_VARS = (
    "REDIS_HOST",
    "REDIS_PORT",
    "REDIS_PASSWORD",
    "PARSER_WORKER_CONCURRENCY",
    "UPLOAD_SERVICE_URL",
    "POSTGRES_HOST",
    "POSTGRES_PORT",
    "POSTGRES_USER",
    "POSTGRES_PASSWORD",
    "POSTGRES_DB",
    "LOG_FORMAT",
    "LOG_LEVEL",
    "INTERNAL_API_TOKEN",
)


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    for name in _ENV_VARS:
        monkeypatch.delenv(name, raising=False)


@pytest.fixture(autouse=True)
def _reset_db_pool():
    """DBService keeps a class-level pool; never let one leak between tests."""
    from services.db_service import DBService

    DBService._connection_pool = None
    yield
    DBService._connection_pool = None


@pytest.fixture
def no_sleep(monkeypatch):
    calls = []
    import time

    monkeypatch.setattr(time, "sleep", lambda s: calls.append(s))
    return calls


SAMPLE_RESUME = """Jane Doe
jane.doe@example.com | (415) 555-0123 | San Francisco, CA
linkedin.com/in/janedoe

Summary
Backend engineer with 6 years of experience building distributed systems.

Experience
Senior Software Engineer
Acme Corp
San Francisco, CA
Jan 2020 - Present
- Led migration of monolith to microservices on Kubernetes
- Reduced p99 latency by 40%
Technologies: Python, Go, PostgreSQL, Redis

Acme Labs | Backend Developer | Remote | 2017 - 2019
- Built REST APIs in Django

Education
B.S. in Computer Science, Stanford University, 2017
GPA: 3.8
Dean's List

Projects
Resume Parser | Python, spaCy, Redis
built a pipeline that extracts structured data from resumes
https://github.com/janedoe/resume-parser

Certifications
1. AWS Certified Solutions Architect
2. Winner of the 2019 Company Hackathon award
"""


@pytest.fixture
def sample_resume():
    return SAMPLE_RESUME
