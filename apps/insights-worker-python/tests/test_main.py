"""Tests for the insights worker entrypoint (main.py)."""
import signal
from unittest.mock import MagicMock

import pytest

import main
from constants import QUEUE_NAME

INSIGHTS = {"total_resumes": 3, "processed_resumes": 2, "top_skills": [], "timestamp": "2026-01-01T00:00:00"}


@pytest.fixture
def aggregator(monkeypatch):
    instance = MagicMock(name="InsightsAggregator()")
    instance.aggregate_all.return_value = dict(INSIGHTS)
    monkeypatch.setattr(main, "InsightsAggregator", MagicMock(return_value=instance))
    return instance


@pytest.fixture
def db_cls(monkeypatch):
    cls = MagicMock(name="DBService")
    monkeypatch.setattr(main, "DBService", cls)
    return cls


def test_process_insights_job_returns_aggregated_insights(aggregator):
    assert main.process_insights_job({"action": "aggregate"}) == {"insights": INSIGHTS, "status": "completed"}
    aggregator.aggregate_all.assert_called_once()


def test_process_insights_job_ignores_job_payload(aggregator):
    assert main.process_insights_job({})["status"] == "completed"


def test_process_insights_job_tolerates_partial_insights(aggregator):
    aggregator.aggregate_all.return_value = {}
    assert main.process_insights_job({}) == {"insights": {}, "status": "completed"}


def test_process_insights_job_reraises_failures(aggregator, caplog):
    aggregator.aggregate_all.side_effect = RuntimeError("db down")
    with pytest.raises(RuntimeError, match="db down"):
        main.process_insights_job({})
    assert "Insights aggregation failed: db down" in caplog.text


def test_graceful_shutdown_closes_pool_and_exits_zero(db_cls):
    with pytest.raises(SystemExit) as exc:
        main.graceful_shutdown(signal.SIGTERM, None)
    assert exc.value.code == 0
    db_cls.close_pool.assert_called_once()


@pytest.fixture
def queue_service(monkeypatch):
    instance = MagicMock(name="QueueService()")
    ctor = MagicMock(return_value=instance)
    monkeypatch.setattr(main, "QueueService", ctor)
    instance.ctor = ctor
    return instance


@pytest.fixture
def signals(monkeypatch):
    calls = {}
    monkeypatch.setattr(main.signal, "signal", lambda sig, handler: calls.__setitem__(sig, handler))
    return calls


def test_main_wires_queue_service_from_env(monkeypatch, queue_service, signals, db_cls):
    monkeypatch.setenv("REDIS_HOST", "r")
    monkeypatch.setenv("REDIS_PORT", "7002")
    monkeypatch.setenv("REDIS_PASSWORD", "pw")
    monkeypatch.setenv("INSIGHTS_WORKER_CONCURRENCY", "4")

    main.main()

    assert signals == {signal.SIGTERM: main.graceful_shutdown, signal.SIGINT: main.graceful_shutdown}
    queue_service.ctor.assert_called_once_with(
        queue_name=QUEUE_NAME, redis_host="r", redis_port=7002, redis_password="pw",
        processor=main.process_insights_job, concurrency=4,
    )
    queue_service.start.assert_called_once()
    db_cls.close_pool.assert_called_once()


def test_main_defaults(queue_service, signals, db_cls):
    main.main()
    kwargs = queue_service.ctor.call_args.kwargs
    assert (kwargs["redis_host"], kwargs["redis_port"], kwargs["redis_password"], kwargs["concurrency"]) == (
        "redis", 6379, None, 2,
    )


def test_main_keyboard_interrupt(queue_service, signals, db_cls):
    queue_service.start.side_effect = KeyboardInterrupt
    main.main()
    queue_service.stop.assert_called_once()
    db_cls.close_pool.assert_called_once()


def test_main_fatal_error_exits_one(queue_service, signals, db_cls):
    queue_service.start.side_effect = RuntimeError("redis down")
    with pytest.raises(SystemExit) as exc:
        main.main()
    assert exc.value.code == 1
    queue_service.stop.assert_called_once()
    db_cls.close_pool.assert_called_once()
