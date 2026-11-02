"""Tests for the SQL query constants."""
import queries


def test_parsed_data_update_targets_resumes_by_id_and_casts_json():
    q = queries.UPDATE_RESUME_PARSED_DATA
    assert "UPDATE resumes" in q
    assert q.rstrip().endswith("WHERE id = %s")
    assert q.count("::jsonb") == 3  # experience, education, parsed_data
    assert "updated_at = NOW()" in q


def test_status_update_is_parameterised():
    q = queries.UPDATE_RESUME_STATUS
    assert "SET status = %s" in q and "WHERE id = %s" in q
    assert q.index("status = %s") < q.index("WHERE id = %s")  # params order: (status, id)


def test_exports():
    assert set(queries.__all__) == {"UPDATE_RESUME_PARSED_DATA", "UPDATE_RESUME_STATUS"}
