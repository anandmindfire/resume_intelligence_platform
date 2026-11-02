"""Tests for the SQL query constants."""
import queries


def test_count_queries():
    assert queries.GET_RESUME_COUNT.count("%s") == 0
    assert "FROM resumes" in queries.GET_RESUME_COUNT
    assert queries.GET_PROCESSED_COUNT.count("%s") == 1
    assert "WHERE status = %s" in queries.GET_PROCESSED_COUNT


def test_top_skills_query_unnests_groups_orders_and_limits():
    q = queries.GET_TOP_SKILLS
    assert "UNNEST(skills)" in q
    assert "GROUP BY skill" in q
    assert "ORDER BY count DESC" in q
    assert q.rstrip().endswith("LIMIT %s") and q.count("%s") == 1
    # aliases must match the keys InsightsAggregator reads from RealDictCursor rows
    assert "as skill" in q and "as count" in q


def test_exports():
    assert set(queries.__all__) == {"GET_RESUME_COUNT", "GET_PROCESSED_COUNT", "GET_TOP_SKILLS"}
