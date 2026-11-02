"""Tests for services.queue_service.QueueService (Redis mocked)."""
import json
import signal
from unittest.mock import MagicMock

import pytest
import redis

from services import queue_service as qs_module
from services.queue_service import (
    DEFAULT_BACKOFF_DELAY_SECONDS,
    DEFAULT_MAX_ATTEMPTS,
    QueueService,
)

QUEUE = "test-queue"


@pytest.fixture
def fake_redis(monkeypatch):
    client = MagicMock(name="redis_client")
    client.zrangebyscore.return_value = []
    ctor = MagicMock(name="Redis", return_value=client)
    monkeypatch.setattr(qs_module.redis, "Redis", ctor)
    return ctor, client


@pytest.fixture
def signal_calls(monkeypatch):
    calls = []
    monkeypatch.setattr(qs_module.signal, "signal", lambda sig, handler: calls.append((sig, handler)))
    return calls


@pytest.fixture
def make_service(fake_redis, signal_calls):
    def _make(processor=None, **kwargs):
        return QueueService(queue_name=QUEUE, processor=processor, **kwargs)

    return _make


@pytest.fixture
def frozen_time(monkeypatch):
    monkeypatch.setattr(qs_module.time, "time", lambda: 1000.0)
    return 1000.0


def _queue_job(client, job):
    client.blpop.return_value = (QUEUE, json.dumps(job))


def _pushed(client, key):
    """Return decoded payloads rpush'd to the given key."""
    return [json.loads(c.args[1]) for c in client.rpush.call_args_list if c.args[0] == key]


# --------------------------------------------------------------------------- init


def test_init_configures_redis_client_and_defaults(make_service, fake_redis):
    ctor, client = fake_redis
    svc = make_service(redis_host="h", redis_port=1234, redis_password="pw", concurrency=4)

    ctor.assert_called_once_with(
        host="h",
        port=1234,
        password="pw",
        decode_responses=True,
        socket_connect_timeout=5,
        socket_timeout=5,
        retry_on_timeout=True,
    )
    assert svc.redis_client is client
    assert svc.retry_set_key == f"{QUEUE}:retry"
    assert svc.max_attempts == DEFAULT_MAX_ATTEMPTS == 3
    assert svc.backoff_delay_seconds == DEFAULT_BACKOFF_DELAY_SECONDS == 5
    assert svc.concurrency == 4
    assert svc.running is False


def test_init_registers_sigterm_and_sigint_handlers(make_service, signal_calls):
    svc = make_service()
    registered = {sig: handler for sig, handler in signal_calls}
    assert set(registered) == {signal.SIGTERM, signal.SIGINT}
    assert all(h == svc._signal_handler for h in registered.values())


def test_signal_handler_stops_loop_and_exits_cleanly(make_service):
    svc = make_service()
    svc.running = True
    with pytest.raises(SystemExit) as exc:
        svc._signal_handler(signal.SIGTERM, None)
    assert exc.value.code == 0
    assert svc.running is False


# --------------------------------------------------------------------------- _process_job


def test_process_job_without_processor_raises(make_service):
    with pytest.raises(ValueError, match="No processor"):
        make_service()._process_job({"resumeId": "r1"})


def test_process_job_returns_processor_result(make_service):
    processor = MagicMock(return_value={"ok": True})
    assert make_service(processor)._process_job({"resumeId": "r1"}) == {"ok": True}
    processor.assert_called_once_with({"resumeId": "r1"})


def test_process_job_reraises_processor_errors(make_service):
    processor = MagicMock(side_effect=RuntimeError("boom"))
    with pytest.raises(RuntimeError, match="boom"):
        make_service(processor)._process_job({})


# --------------------------------------------------------------------------- retry set


def test_move_retry_jobs_back_returns_false_when_nothing_due(make_service, fake_redis, frozen_time):
    _, client = fake_redis
    svc = make_service()
    assert svc._move_retry_jobs_back() is False
    client.zrangebyscore.assert_called_once_with(f"{QUEUE}:retry", 0, frozen_time, start=0, num=1)
    client.zrem.assert_not_called()
    client.rpush.assert_not_called()


def test_move_retry_jobs_back_requeues_one_due_job(make_service, fake_redis, frozen_time):
    _, client = fake_redis
    job_json = json.dumps({"resumeId": "r1", "_attempt": 1})
    client.zrangebyscore.return_value = [job_json]
    svc = make_service()

    assert svc._move_retry_jobs_back() is True
    client.zrem.assert_called_once_with(f"{QUEUE}:retry", job_json)
    client.rpush.assert_called_once_with(QUEUE, job_json)


def test_move_retry_jobs_back_swallows_redis_errors(make_service, fake_redis):
    _, client = fake_redis
    client.zrangebyscore.side_effect = redis.ConnectionError("down")
    assert make_service()._move_retry_jobs_back() is False


def test_move_retry_jobs_back_with_corrupt_member_still_requeues_but_reports_false(make_service, fake_redis):
    _, client = fake_redis
    client.zrangebyscore.return_value = ["{not json"]
    svc = make_service()
    assert svc._move_retry_jobs_back() is False
    client.rpush.assert_called_once_with(QUEUE, "{not json")


# --------------------------------------------------------------------------- _consume_job


def test_consume_job_timeout_is_a_noop(make_service, fake_redis):
    _, client = fake_redis
    client.blpop.return_value = None
    processor = MagicMock()
    svc = make_service(processor)

    assert svc._consume_job() is True
    client.blpop.assert_called_once_with(QUEUE, timeout=1)
    processor.assert_not_called()
    client.rpush.assert_not_called()


def test_consume_job_success_publishes_result(make_service, fake_redis):
    _, client = fake_redis
    _queue_job(client, {"resumeId": "r1", "x": 1})
    processor = MagicMock(return_value={"status": "completed"})
    svc = make_service(processor)

    assert svc._consume_job() is True
    processor.assert_called_once_with({"resumeId": "r1", "x": 1})
    assert _pushed(client, f"{QUEUE}:results") == [
        {"job": {"resumeId": "r1", "x": 1}, "result": {"status": "completed"}, "status": "completed"}
    ]
    client.zadd.assert_not_called()


def test_consume_job_strips_internal_attempt_field_before_processing(make_service, fake_redis):
    _, client = fake_redis
    _queue_job(client, {"resumeId": "r1", "_attempt": 2})
    processor = MagicMock(return_value=None)
    make_service(processor)._consume_job()
    processor.assert_called_once_with({"resumeId": "r1"})


def test_consume_job_first_failure_schedules_retry_with_base_delay(make_service, fake_redis, frozen_time):
    _, client = fake_redis
    _queue_job(client, {"resumeId": "r1"})
    svc = make_service(MagicMock(side_effect=RuntimeError("fail")))

    assert svc._consume_job() is True
    client.zadd.assert_called_once()
    key, mapping = client.zadd.call_args.args
    assert key == f"{QUEUE}:retry"
    [(payload, score)] = mapping.items()
    assert json.loads(payload) == {"resumeId": "r1", "_attempt": 1}
    assert score == frozen_time + 5
    assert _pushed(client, f"{QUEUE}:failed") == []


def test_consume_job_backoff_is_exponential(make_service, fake_redis, frozen_time):
    _, client = fake_redis
    _queue_job(client, {"resumeId": "r1", "_attempt": 1})
    svc = make_service(MagicMock(side_effect=RuntimeError("fail")), backoff_delay_seconds=3)

    svc._consume_job()
    [(payload, score)] = client.zadd.call_args.args[1].items()
    assert json.loads(payload)["_attempt"] == 2
    assert score == frozen_time + 3 * 2


def test_consume_job_exhausted_retries_go_to_failed_queue(make_service, fake_redis):
    _, client = fake_redis
    _queue_job(client, {"resumeId": "r1", "_attempt": 2})
    svc = make_service(MagicMock(side_effect=RuntimeError("still broken")))

    assert svc._consume_job() is True
    client.zadd.assert_not_called()
    assert _pushed(client, f"{QUEUE}:failed") == [
        {"job": {"resumeId": "r1"}, "error": "still broken", "status": "failed", "attempts": 3}
    ]


def test_consume_job_with_single_attempt_fails_immediately(make_service, fake_redis):
    _, client = fake_redis
    _queue_job(client, {"resumeId": "r1"})
    svc = make_service(MagicMock(side_effect=ValueError("bad")), max_attempts=1)

    svc._consume_job()
    client.zadd.assert_not_called()
    assert _pushed(client, f"{QUEUE}:failed")[0]["attempts"] == 1


def test_consume_job_full_retry_lifecycle(make_service, fake_redis, frozen_time):
    """A job that always fails is attempted max_attempts times, then dead-lettered."""
    _, client = fake_redis
    processor = MagicMock(side_effect=RuntimeError("nope"))
    svc = make_service(processor)

    job = {"resumeId": "r9"}
    for _ in range(DEFAULT_MAX_ATTEMPTS):
        _queue_job(client, job)
        client.zadd.reset_mock()
        svc._consume_job()
        if client.zadd.called:
            [(payload, _)] = client.zadd.call_args.args[1].items()
            job = json.loads(payload)

    assert processor.call_count == DEFAULT_MAX_ATTEMPTS
    failed = _pushed(client, f"{QUEUE}:failed")
    assert len(failed) == 1 and failed[0]["attempts"] == DEFAULT_MAX_ATTEMPTS


def test_consume_job_without_processor_is_treated_as_job_failure(make_service, fake_redis):
    _, client = fake_redis
    _queue_job(client, {"resumeId": "r1"})
    make_service(None)._consume_job()
    client.zadd.assert_called_once()


def test_consume_job_invalid_json_is_dropped_without_crashing(make_service, fake_redis, no_sleep):
    _, client = fake_redis
    client.blpop.return_value = (QUEUE, "{oops")
    processor = MagicMock()
    svc = make_service(processor)

    assert svc._consume_job() is True
    processor.assert_not_called()
    assert no_sleep == [1]


def test_consume_job_redis_connection_error_backs_off(make_service, fake_redis, no_sleep):
    _, client = fake_redis
    client.blpop.side_effect = redis.ConnectionError("refused")
    assert make_service(MagicMock())._consume_job() is True
    assert no_sleep == [5]


def test_result_publish_failure_does_not_retry_a_successful_job(make_service, fake_redis):
    _, client = fake_redis
    _queue_job(client, {"resumeId": "r1"})
    processor = MagicMock(return_value={"when": object()})  # not JSON serializable
    assert make_service(processor)._consume_job() is True
    processor.assert_called_once()
    client.zadd.assert_not_called()
    failed_queues = [c.args[0] for c in client.rpush.call_args_list]
    assert not any(q.endswith(":failed") for q in failed_queues)


# --------------------------------------------------------------------------- start / stop


def test_start_raises_if_redis_unreachable(make_service, fake_redis):
    _, client = fake_redis
    client.ping.side_effect = redis.ConnectionError("no route")
    svc = make_service()
    with pytest.raises(redis.ConnectionError):
        svc.start()
    assert svc.running is False


def test_start_loops_until_running_is_cleared(make_service, monkeypatch):
    svc = make_service()
    calls = []

    def fake_consume():
        calls.append(1)
        if len(calls) == 3:
            svc.running = False
        return True

    monkeypatch.setattr(svc, "_consume_job", fake_consume)
    svc.start()
    assert len(calls) == 3


def test_start_breaks_on_keyboard_interrupt(make_service, monkeypatch):
    svc = make_service()
    monkeypatch.setattr(svc, "_consume_job", MagicMock(side_effect=KeyboardInterrupt))
    svc.start()
    svc._consume_job.assert_called_once()


def test_start_survives_unexpected_loop_errors(make_service, monkeypatch, no_sleep):
    svc = make_service()
    effects = [RuntimeError("transient"), None]

    def fake_consume():
        effect = effects.pop(0)
        if effect:
            raise effect
        svc.running = False

    monkeypatch.setattr(svc, "_consume_job", fake_consume)
    svc.start()
    assert no_sleep == [1]


def test_start_exits_loop_on_error_after_stop_requested(make_service, monkeypatch, no_sleep):
    svc = make_service()

    def fake_consume():
        svc.running = False
        raise RuntimeError("during shutdown")

    monkeypatch.setattr(svc, "_consume_job", fake_consume)
    svc.start()
    assert no_sleep == []


def test_stop_closes_client(make_service, fake_redis):
    _, client = fake_redis
    svc = make_service()
    svc.running = True
    svc.stop()
    assert svc.running is False
    client.close.assert_called_once()


def test_stop_tolerates_missing_client(make_service):
    svc = make_service()
    svc.redis_client = None
    svc.stop()
    assert svc.running is False
