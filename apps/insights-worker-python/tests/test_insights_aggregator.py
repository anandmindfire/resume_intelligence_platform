"""Tests for aggregations.insights_aggregator.InsightsAggregator (DBService mocked)."""
import json
from datetime import datetime
from unittest.mock import MagicMock

import pytest

from aggregations import insights_aggregator as agg_module
from aggregations.insights_aggregator import InsightsAggregator
from constants import DEFAULT_TOP_SKILLS_LIMIT


@pytest.fixture
def db(monkeypatch):
    instance = MagicMock(name="DBService()")
    instance.get_resume_count.return_value = 120
    instance.get_processed_count.return_value = 95
    instance.get_top_skills.return_value = [
        {"skill": "Python", "count": 80},
        {"skill": "React", "count": 41},
    ]
    monkeypatch.setattr(agg_module, "DBService", MagicMock(return_value=instance))
    return instance


def test_aggregate_all_combines_db_metrics(db):
    insights = InsightsAggregator().aggregate_all()

    assert insights["total_resumes"] == 120
    assert insights["processed_resumes"] == 95
    assert insights["top_skills"] == [{"skill": "Python", "count": 80}, {"skill": "React", "count": 41}]
    db.get_top_skills.assert_called_once_with(DEFAULT_TOP_SKILLS_LIMIT)


def test_timestamp_is_iso8601_utc_now(db):
    before = datetime.utcnow()
    ts = datetime.fromisoformat(InsightsAggregator().aggregate_all()["timestamp"])
    assert before <= ts <= datetime.utcnow()


def test_top_skills_rows_are_projected_to_skill_and_count_only(db):
    db.get_top_skills.return_value = [{"skill": "Go", "count": 3, "extra": "ignored"}]
    assert InsightsAggregator().aggregate_all()["top_skills"] == [{"skill": "Go", "count": 3}]


def test_empty_database(db):
    db.get_resume_count.return_value = 0
    db.get_processed_count.return_value = 0
    db.get_top_skills.return_value = []
    insights = InsightsAggregator().aggregate_all()
    assert (insights["total_resumes"], insights["processed_resumes"], insights["top_skills"]) == (0, 0, [])


def test_result_is_json_serialisable_for_queue_publishing(db):
    json.dumps(InsightsAggregator().aggregate_all())


def test_db_errors_propagate(db):
    db.get_processed_count.side_effect = RuntimeError("db down")
    with pytest.raises(RuntimeError, match="db down"):
        InsightsAggregator().aggregate_all()


def test_malformed_skill_rows_raise(db):
    db.get_top_skills.return_value = [("Python", 3)]  # tuple rows instead of dict rows
    with pytest.raises(TypeError):
        InsightsAggregator().aggregate_all()
