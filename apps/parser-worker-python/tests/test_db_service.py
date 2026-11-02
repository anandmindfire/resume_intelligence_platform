"""Tests for services.db_service.DBService (psycopg2 pool/connection mocked)."""
from types import SimpleNamespace
from unittest.mock import MagicMock

import psycopg2
import pytest
from psycopg2.extras import Json

from queries import UPDATE_RESUME_PARSED_DATA, UPDATE_RESUME_STATUS
from services import db_service as db_module
from services.db_service import DBService


@pytest.fixture
def pg(monkeypatch):
    """Mock ThreadedConnectionPool -> pool -> connection -> cursor chain."""
    cursor = MagicMock(name="cursor")
    conn = MagicMock(name="conn")
    conn.cursor.return_value = cursor
    pool = MagicMock(name="pool")
    pool.getconn.return_value = conn
    pool_cls = MagicMock(name="ThreadedConnectionPool", return_value=pool)
    monkeypatch.setattr(db_module.pool, "ThreadedConnectionPool", pool_cls)
    return SimpleNamespace(pool_cls=pool_cls, pool=pool, conn=conn, cursor=cursor)


PARSED = {
    "name": "Jane Doe",
    "email": "jane@example.com",
    "phone": "(415) 555-0123",
    "skills": ["Python", "Redis"],
    "experience": [{"title": "Engineer", "company": "Acme"}],
    "education": [{"degree": "B.S.", "institution": "Stanford University"}],
    "projects": [{"title": "Parser"}],
    "achievements": [{"title": "AWS Certified"}],
    "rawText": "Jane Doe ...",
}


# --------------------------------------------------------------------------- pool


def test_pool_is_created_lazily_with_env_config(monkeypatch, pg):
    monkeypatch.setenv("POSTGRES_HOST", "db.internal")
    monkeypatch.setenv("POSTGRES_PORT", "6543")
    monkeypatch.setenv("POSTGRES_USER", "svc")
    monkeypatch.setenv("POSTGRES_PASSWORD", "pw")
    monkeypatch.setenv("POSTGRES_DB", "resumes")
    pg.pool_cls.assert_not_called()

    assert DBService._get_pool() is pg.pool
    pg.pool_cls.assert_called_once_with(
        minconn=1, maxconn=10, host="db.internal", port=6543, user="svc",
        password="pw", database="resumes", connect_timeout=5,
    )


def test_pool_defaults(pg):
    DBService._get_pool()
    kwargs = pg.pool_cls.call_args.kwargs
    assert (kwargs["host"], kwargs["port"], kwargs["user"], kwargs["database"]) == (
        "postgres", 5432, "postgres", "resume_db",
    )


def test_pool_is_reused_across_calls_and_instances(pg):
    DBService().update_resume_status("r1", "parsed")
    DBService().update_resume_status("r2", "parsed")
    pg.pool_cls.assert_called_once()


def test_pool_creation_failure_propagates_and_is_retried_next_time(pg):
    pg.pool_cls.side_effect = [psycopg2.OperationalError("db down"), pg.pool]
    with pytest.raises(psycopg2.OperationalError):
        DBService._get_pool()
    assert DBService._connection_pool is None
    assert DBService._get_pool() is pg.pool


def test_close_pool_closes_and_resets(pg):
    DBService._get_pool()
    DBService.close_pool()
    pg.pool.closeall.assert_called_once()
    assert DBService._connection_pool is None


def test_close_pool_without_pool_is_noop(pg):
    DBService.close_pool()
    pg.pool.closeall.assert_not_called()


# --------------------------------------------------------------------------- save_parsed_data


def test_query_placeholders_match_parameters():
    assert UPDATE_RESUME_PARSED_DATA.count("%s") == 8
    assert UPDATE_RESUME_STATUS.count("%s") == 2


def test_save_parsed_data_writes_all_columns(pg):
    DBService().save_parsed_data("res-1", PARSED)

    query, params = pg.cursor.execute.call_args.args
    assert query == UPDATE_RESUME_PARSED_DATA
    assert len(params) == UPDATE_RESUME_PARSED_DATA.count("%s")
    name, email, phone, skills, exp, edu, full, resume_id = params
    assert (name, email, phone, resume_id) == ("Jane Doe", "jane@example.com", "(415) 555-0123", "res-1")
    assert skills == ["Python", "Redis"]
    assert isinstance(exp, Json) and exp.adapted == PARSED["experience"]
    assert isinstance(edu, Json) and edu.adapted == PARSED["education"]
    assert isinstance(full, Json) and full.adapted == PARSED

    pg.conn.commit.assert_called_once()
    pg.conn.rollback.assert_not_called()
    pg.cursor.close.assert_called_once()
    pg.pool.putconn.assert_called_once_with(pg.conn)


def test_save_parsed_data_fills_defaults_for_missing_keys(pg):
    DBService().save_parsed_data("res-2", {"name": "Solo"})
    params = pg.cursor.execute.call_args.args[1]
    assert params[1] is None and params[2] is None
    assert params[3] == []
    assert params[4].adapted == [] and params[5].adapted == []
    assert params[6].adapted == {
        "name": "Solo", "email": None, "phone": None, "skills": [], "experience": [],
        "education": [], "projects": [], "achievements": [], "rawText": "",
    }


def test_save_parsed_data_coerces_non_list_skills_column(pg):
    DBService().save_parsed_data("res-3", {"skills": "Python, Go"})
    params = pg.cursor.execute.call_args.args[1]
    assert params[3] == []
    # the raw value is still preserved inside parsed_data JSON
    assert params[6].adapted["skills"] == "Python, Go"


def test_save_parsed_data_rolls_back_and_reraises_on_query_error(pg):
    pg.cursor.execute.side_effect = psycopg2.DatabaseError("constraint violation")
    with pytest.raises(psycopg2.DatabaseError):
        DBService().save_parsed_data("res-4", PARSED)
    pg.conn.rollback.assert_called_once()
    pg.conn.commit.assert_not_called()
    pg.cursor.close.assert_called_once()
    pg.pool.putconn.assert_called_once_with(pg.conn)


def test_save_parsed_data_when_pool_unavailable(pg):
    pg.pool_cls.side_effect = psycopg2.OperationalError("db down")
    with pytest.raises(psycopg2.OperationalError):
        DBService().save_parsed_data("res-5", PARSED)
    pg.conn.rollback.assert_not_called()


# --------------------------------------------------------------------------- update_resume_status


def test_update_resume_status(pg):
    DBService().update_resume_status("res-1", "parsed")
    pg.cursor.execute.assert_called_once_with(UPDATE_RESUME_STATUS, ("parsed", "res-1"))
    pg.conn.commit.assert_called_once()
    pg.cursor.close.assert_called_once()
    pg.pool.putconn.assert_called_once_with(pg.conn)


def test_update_resume_status_rolls_back_on_error(pg):
    pg.conn.commit.side_effect = psycopg2.InterfaceError("connection closed")
    with pytest.raises(psycopg2.InterfaceError):
        DBService().update_resume_status("res-1", "failed")
    pg.conn.rollback.assert_called_once()
    pg.pool.putconn.assert_called_once_with(pg.conn)


def test_update_resume_status_when_getconn_fails(pg):
    pg.pool.getconn.side_effect = psycopg2.pool.PoolError("connection pool exhausted")
    with pytest.raises(psycopg2.pool.PoolError):
        DBService().update_resume_status("res-1", "failed")
    pg.pool.putconn.assert_not_called()


@pytest.mark.parametrize("call", [
    lambda svc: svc.save_parsed_data("r1", PARSED),
    lambda svc: svc.update_resume_status("r1", "parsed"),
], ids=["save_parsed_data", "update_resume_status"])
def test_cursor_creation_failure_surfaces_db_error_and_returns_connection(pg, call):
    pg.conn.cursor.side_effect = psycopg2.InterfaceError("connection already closed")
    with pytest.raises(psycopg2.InterfaceError):
        call(DBService())
    pg.pool.putconn.assert_called_once_with(pg.conn)
