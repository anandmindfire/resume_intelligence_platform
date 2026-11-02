"""Tests for services.db_service.DBService (psycopg2 pool/connection mocked)."""
from types import SimpleNamespace
from unittest.mock import MagicMock

import psycopg2
import pytest
from psycopg2.extras import RealDictCursor

from constants import DEFAULT_TOP_SKILLS_LIMIT, STATUS_MATCHED
from queries import GET_PROCESSED_COUNT, GET_RESUME_COUNT, GET_TOP_SKILLS
from services import db_service as db_module
from services.db_service import DBService


@pytest.fixture
def pg(monkeypatch):
    cursor = MagicMock(name="cursor")
    conn = MagicMock(name="conn")
    conn.cursor.return_value = cursor
    pool = MagicMock(name="pool")
    pool.getconn.return_value = conn
    pool_cls = MagicMock(name="ThreadedConnectionPool", return_value=pool)
    monkeypatch.setattr(db_module.pool, "ThreadedConnectionPool", pool_cls)
    return SimpleNamespace(pool_cls=pool_cls, pool=pool, conn=conn, cursor=cursor)


def _assert_connection_released(pg):
    pg.cursor.close.assert_called_once()
    pg.pool.putconn.assert_called_once_with(pg.conn)


# --------------------------------------------------------------------------- pool


def test_pool_is_created_lazily_with_env_config(monkeypatch, pg):
    monkeypatch.setenv("POSTGRES_HOST", "db.internal")
    monkeypatch.setenv("POSTGRES_PORT", "6543")
    monkeypatch.setenv("POSTGRES_USER", "svc")
    monkeypatch.setenv("POSTGRES_PASSWORD", "pw")
    monkeypatch.setenv("POSTGRES_DB", "analytics")
    pg.pool_cls.assert_not_called()

    assert DBService._get_pool() is pg.pool
    pg.pool_cls.assert_called_once_with(
        minconn=1, maxconn=5, host="db.internal", port=6543, user="svc",
        password="pw", database="analytics", connect_timeout=5,
    )


def test_pool_defaults_and_reuse(pg):
    DBService().get_resume_count()
    DBService().get_processed_count()
    pg.pool_cls.assert_called_once()
    kwargs = pg.pool_cls.call_args.kwargs
    assert (kwargs["host"], kwargs["port"], kwargs["user"], kwargs["password"], kwargs["database"]) == (
        "postgres", 5432, "postgres", "postgres", "resume_db",
    )


def test_pool_creation_failure_propagates_and_is_retried(pg):
    pg.pool_cls.side_effect = [psycopg2.OperationalError("db down"), pg.pool]
    with pytest.raises(psycopg2.OperationalError):
        DBService().get_resume_count()
    assert DBService._connection_pool is None
    pg.cursor.fetchone.return_value = (1,)
    assert DBService().get_resume_count() == 1


def test_close_pool(pg):
    DBService._get_pool()
    DBService.close_pool()
    pg.pool.closeall.assert_called_once()
    assert DBService._connection_pool is None
    DBService.close_pool()  # second call is a no-op
    pg.pool.closeall.assert_called_once()


# --------------------------------------------------------------------------- counts


def test_get_resume_count(pg):
    pg.cursor.fetchone.return_value = (42,)
    assert DBService().get_resume_count() == 42
    pg.cursor.execute.assert_called_once_with(GET_RESUME_COUNT)
    _assert_connection_released(pg)


def test_get_processed_count_filters_by_matched_status(pg):
    pg.cursor.fetchone.return_value = (7,)
    assert DBService().get_processed_count() == 7
    pg.cursor.execute.assert_called_once_with(GET_PROCESSED_COUNT, (STATUS_MATCHED,))
    _assert_connection_released(pg)


@pytest.mark.parametrize("method", ["get_resume_count", "get_processed_count"])
def test_counts_default_to_zero_when_no_row(pg, method):
    pg.cursor.fetchone.return_value = None
    assert getattr(DBService(), method)() == 0


@pytest.mark.parametrize("method", ["get_resume_count", "get_processed_count", "get_top_skills"])
def test_query_errors_propagate_and_release_connection(pg, method):
    pg.cursor.execute.side_effect = psycopg2.ProgrammingError('relation "resumes" does not exist')
    with pytest.raises(psycopg2.ProgrammingError):
        getattr(DBService(), method)()
    _assert_connection_released(pg)


@pytest.mark.parametrize("method", ["get_resume_count", "get_processed_count", "get_top_skills"])
def test_getconn_failure_propagates(pg, method):
    pg.pool.getconn.side_effect = psycopg2.pool.PoolError("exhausted")
    with pytest.raises(psycopg2.pool.PoolError):
        getattr(DBService(), method)()
    pg.pool.putconn.assert_not_called()


# --------------------------------------------------------------------------- top skills


def test_get_top_skills_uses_dict_cursor_and_limit(pg):
    rows = [{"skill": "Python", "count": 10}, {"skill": "Go", "count": 4}]
    pg.cursor.fetchall.return_value = rows
    assert DBService().get_top_skills(5) == rows
    pg.conn.cursor.assert_called_once_with(cursor_factory=RealDictCursor)
    pg.cursor.execute.assert_called_once_with(GET_TOP_SKILLS, (5,))
    _assert_connection_released(pg)


def test_get_top_skills_default_limit(pg):
    pg.cursor.fetchall.return_value = []
    assert DBService().get_top_skills() == []
    assert pg.cursor.execute.call_args.args[1] == (DEFAULT_TOP_SKILLS_LIMIT,)


@pytest.mark.parametrize("method", ["get_resume_count", "get_processed_count", "get_top_skills"])
def test_cursor_creation_failure_surfaces_db_error_and_returns_connection(pg, method):
    pg.conn.cursor.side_effect = psycopg2.InterfaceError("connection already closed")
    with pytest.raises(psycopg2.InterfaceError):
        getattr(DBService(), method)()
    pg.pool.putconn.assert_called_once_with(pg.conn)
