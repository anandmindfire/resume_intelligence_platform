"""Tests for the parser worker entrypoint (main.py).

ResumeParser, DBService, QueueService and urllib are mocked; no network or DB.
"""
import json
import signal
import urllib.request
from unittest.mock import MagicMock

import pytest

import main
from constants import MATCHER_ENDPOINT_PATH, QUEUE_NAME, STATUS_FAILED, STATUS_PARSED

PARSED = {"name": "Jane Doe", "skills": ["Python", "Go"], "email": "jane@example.com"}
JOB = {"resumeId": "res-1", "extractedText": "Jane Doe\nPython developer"}


@pytest.fixture
def parser(monkeypatch):
    instance = MagicMock(name="ResumeParser()")
    instance.parse.return_value = dict(PARSED)
    monkeypatch.setattr(main, "ResumeParser", MagicMock(return_value=instance))
    return instance


@pytest.fixture
def db(monkeypatch):
    instance = MagicMock(name="DBService()")
    cls = MagicMock(name="DBService", return_value=instance)
    monkeypatch.setattr(main, "DBService", cls)
    instance.cls = cls
    return instance


@pytest.fixture
def urlopen(monkeypatch):
    response = MagicMock(status=200)
    response.__enter__.return_value = response
    mock = MagicMock(name="urlopen", return_value=response)
    monkeypatch.setattr(urllib.request, "urlopen", mock)
    mock.response = response
    return mock


# --------------------------------------------------------------------------- validation


@pytest.mark.parametrize(
    "job, message",
    [
        ({"extractedText": "x"}, "No resumeId"),
        ({"resumeId": "", "extractedText": "x"}, "No resumeId"),
        ({"resumeId": "r1"}, "No extractedText"),
        ({"resumeId": "r1", "extractedText": ""}, "No extractedText"),
    ],
)
def test_invalid_job_is_rejected_before_touching_db(job, message, parser, db):
    with pytest.raises(ValueError, match=message):
        main.process_parse_job(job)
    parser.parse.assert_not_called()
    db.update_resume_status.assert_not_called()


# --------------------------------------------------------------------------- happy path


def test_successful_parse_saves_marks_parsed_and_notifies_matcher(parser, db, urlopen):
    result = main.process_parse_job(dict(JOB))

    assert result == {"resumeId": "res-1", "parsedData": PARSED, "status": "completed"}
    parser.parse.assert_called_once_with(JOB["extractedText"])
    db.save_parsed_data.assert_called_once_with("res-1", PARSED)
    db.update_resume_status.assert_called_once_with("res-1", STATUS_PARSED)

    request = urlopen.call_args.args[0]
    assert urlopen.call_args.kwargs == {"timeout": 5}
    assert request.full_url == f"http://upload-service:3001{MATCHER_ENDPOINT_PATH}"
    assert request.get_method() == "POST"
    assert request.get_header("Content-type") == "application/json"
    assert json.loads(request.data) == {"resumeId": "res-1"}


def test_matcher_url_is_configurable(monkeypatch, parser, db, urlopen):
    monkeypatch.setenv("UPLOAD_SERVICE_URL", "http://localhost:9999")
    main.process_parse_job(dict(JOB))
    assert urlopen.call_args.args[0].full_url == f"http://localhost:9999{MATCHER_ENDPOINT_PATH}"


def test_matcher_call_sends_internal_token_when_configured(monkeypatch, parser, db, urlopen):
    monkeypatch.setenv("INTERNAL_API_TOKEN", "s3cret")
    main.process_parse_job(dict(JOB))
    assert urlopen.call_args.args[0].get_header("X-internal-token") == "s3cret"


def test_matcher_call_omits_internal_token_when_unset(parser, db, urlopen):
    main.process_parse_job(dict(JOB))
    assert urlopen.call_args.args[0].get_header("X-internal-token") is None


def test_save_happens_before_status_update(parser, db, urlopen):
    main.process_parse_job(dict(JOB))
    names = [c[0] for c in db.method_calls]
    assert names.index("save_parsed_data") < names.index("update_resume_status")


def test_matcher_non_200_response_does_not_fail_job(parser, db, urlopen, caplog):
    urlopen.response.status = 503
    assert main.process_parse_job(dict(JOB))["status"] == "completed"
    assert "Failed to queue matcher job: 503" in caplog.text
    db.update_resume_status.assert_called_once_with("res-1", STATUS_PARSED)


def test_matcher_network_error_does_not_fail_job(parser, db, urlopen, caplog):
    urlopen.side_effect = OSError("connection refused")
    assert main.process_parse_job(dict(JOB))["status"] == "completed"
    assert "connection refused" in caplog.text


def test_parsed_data_without_skills_is_handled(parser, db, urlopen):
    parser.parse.return_value = {"name": ""}
    assert main.process_parse_job(dict(JOB))["parsedData"] == {"name": ""}


# --------------------------------------------------------------------------- failure paths


def test_parse_failure_marks_resume_failed_and_reraises(parser, db, urlopen):
    parser.parse.side_effect = RuntimeError("parser crashed")
    with pytest.raises(RuntimeError, match="parser crashed"):
        main.process_parse_job(dict(JOB))
    db.save_parsed_data.assert_not_called()
    db.update_resume_status.assert_called_once_with("res-1", STATUS_FAILED)
    urlopen.assert_not_called()


def test_db_save_failure_marks_resume_failed_and_reraises(parser, db, urlopen):
    db.save_parsed_data.side_effect = RuntimeError("db write failed")
    with pytest.raises(RuntimeError, match="db write failed"):
        main.process_parse_job(dict(JOB))
    db.update_resume_status.assert_called_once_with("res-1", STATUS_FAILED)
    urlopen.assert_not_called()


def test_original_error_is_raised_even_if_marking_failed_also_fails(parser, db, urlopen):
    parser.parse.side_effect = RuntimeError("original")
    db.update_resume_status.side_effect = RuntimeError("db also down")
    with pytest.raises(RuntimeError, match="original"):
        main.process_parse_job(dict(JOB))


# --------------------------------------------------------------------------- shutdown / main()


def test_graceful_shutdown_closes_pool_and_exits_zero(db):
    with pytest.raises(SystemExit) as exc:
        main.graceful_shutdown(signal.SIGTERM, None)
    assert exc.value.code == 0
    db.cls.close_pool.assert_called_once()


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


def test_main_wires_everything_from_env(monkeypatch, queue_service, signals, db):
    monkeypatch.setenv("REDIS_HOST", "r")
    monkeypatch.setenv("REDIS_PORT", "7001")
    monkeypatch.setenv("REDIS_PASSWORD", "pw")
    monkeypatch.setenv("PARSER_WORKER_CONCURRENCY", "5")

    main.main()

    assert signals == {signal.SIGTERM: main.graceful_shutdown, signal.SIGINT: main.graceful_shutdown}
    queue_service.ctor.assert_called_once_with(
        queue_name=QUEUE_NAME, redis_host="r", redis_port=7001, redis_password="pw",
        processor=main.process_parse_job, concurrency=5,
    )
    queue_service.start.assert_called_once()
    db.cls.close_pool.assert_called_once()


def test_main_defaults(queue_service, signals, db):
    main.main()
    kwargs = queue_service.ctor.call_args.kwargs
    assert (kwargs["redis_host"], kwargs["redis_port"], kwargs["redis_password"], kwargs["concurrency"]) == (
        "redis", 6379, None, 3,
    )


def test_main_keyboard_interrupt_stops_and_closes_pool(queue_service, signals, db):
    queue_service.start.side_effect = KeyboardInterrupt
    main.main()
    queue_service.stop.assert_called_once()
    db.cls.close_pool.assert_called_once()


def test_main_fatal_error_exits_one_and_closes_pool(queue_service, signals, db):
    queue_service.start.side_effect = ConnectionError("redis down")
    with pytest.raises(SystemExit) as exc:
        main.main()
    assert exc.value.code == 1
    queue_service.stop.assert_called_once()
    db.cls.close_pool.assert_called_once()
