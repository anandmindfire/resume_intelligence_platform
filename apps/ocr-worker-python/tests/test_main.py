"""Tests for the OCR worker entrypoint (main.py)."""
import json
from unittest.mock import MagicMock

import pytest
import redis

import main
from constants import PARSER_QUEUE_NAME, QUEUE_NAME

JOB = {
    "resumeId": "res-123",
    "filePath": "/uploads/res-123.pdf",
    "fileName": "jane_doe.pdf",
    "mimeType": "application/pdf",
}


@pytest.fixture
def processor(monkeypatch):
    instance = MagicMock(name="OCRProcessor()")
    instance.extract_text.return_value = "Jane Doe\nEngineer"
    monkeypatch.setattr(main, "OCRProcessor", MagicMock(return_value=instance))
    return instance


@pytest.fixture
def redis_client(monkeypatch):
    client = MagicMock(name="redis_client")
    ctor = MagicMock(return_value=client)
    monkeypatch.setattr(redis, "Redis", ctor)
    client.ctor = ctor
    return client


# --------------------------------------------------------------------------- process_ocr_job


def test_process_ocr_job_returns_text_and_enqueues_parser_job(processor, redis_client):
    result = main.process_ocr_job(dict(JOB))

    assert result == {"resumeId": "res-123", "extractedText": "Jane Doe\nEngineer", "status": "completed"}
    processor.extract_text.assert_called_once_with(JOB["filePath"], JOB["mimeType"])

    queue, payload = redis_client.rpush.call_args.args
    assert queue == PARSER_QUEUE_NAME
    assert json.loads(payload) == {
        "resumeId": "res-123",
        "extractedText": "Jane Doe\nEngineer",
        "filePath": JOB["filePath"],
        "fileName": "jane_doe.pdf",
        "mimeType": "application/pdf",
    }


def test_process_ocr_job_uses_redis_settings_from_env(monkeypatch, processor, redis_client):
    monkeypatch.setenv("REDIS_HOST", "cache.internal")
    monkeypatch.setenv("REDIS_PORT", "6380")
    monkeypatch.setenv("REDIS_PASSWORD", "s3cret")
    main.process_ocr_job(dict(JOB))
    redis_client.ctor.assert_called_once_with(
        host="cache.internal", port=6380, password="s3cret", decode_responses=True
    )


def test_process_ocr_job_defaults_redis_settings(processor, redis_client):
    main.process_ocr_job(dict(JOB))
    redis_client.ctor.assert_called_once_with(host="redis", port=6379, password=None, decode_responses=True)


def test_process_ocr_job_missing_file_name_defaults_to_empty(processor, redis_client):
    job = {k: v for k, v in JOB.items() if k != "fileName"}
    main.process_ocr_job(job)
    assert json.loads(redis_client.rpush.call_args.args[1])["fileName"] == ""


@pytest.mark.parametrize("empty", ["", None])
def test_process_ocr_job_with_no_text_fails_and_does_not_enqueue(processor, redis_client, empty):
    processor.extract_text.return_value = empty
    with pytest.raises(ValueError, match="No text extracted"):
        main.process_ocr_job(dict(JOB))
    redis_client.rpush.assert_not_called()


def test_process_ocr_job_propagates_extraction_errors(processor, redis_client):
    processor.extract_text.side_effect = FileNotFoundError("gone")
    with pytest.raises(FileNotFoundError):
        main.process_ocr_job(dict(JOB))
    redis_client.rpush.assert_not_called()


def test_process_ocr_job_still_completes_if_parser_enqueue_fails(processor, redis_client, caplog):
    redis_client.rpush.side_effect = redis.ConnectionError("down")
    result = main.process_ocr_job(dict(JOB))
    assert result["status"] == "completed"
    assert "Failed to queue parser job" in caplog.text


# --------------------------------------------------------------------------- main()


@pytest.fixture
def queue_service(monkeypatch):
    instance = MagicMock(name="QueueService()")
    ctor = MagicMock(return_value=instance)
    monkeypatch.setattr(main, "QueueService", ctor)
    instance.ctor = ctor
    return instance


def test_main_wires_queue_service_from_env(monkeypatch, queue_service):
    monkeypatch.setenv("REDIS_HOST", "r")
    monkeypatch.setenv("REDIS_PORT", "7000")
    monkeypatch.setenv("REDIS_PASSWORD", "pw")
    monkeypatch.setenv("OCR_WORKER_CONCURRENCY", "8")

    main.main()

    queue_service.ctor.assert_called_once_with(
        queue_name=QUEUE_NAME,
        redis_host="r",
        redis_port=7000,
        redis_password="pw",
        processor=main.process_ocr_job,
        concurrency=8,
    )
    queue_service.start.assert_called_once()
    queue_service.stop.assert_not_called()


def test_main_uses_defaults(queue_service):
    main.main()
    kwargs = queue_service.ctor.call_args.kwargs
    assert (kwargs["redis_host"], kwargs["redis_port"], kwargs["concurrency"]) == ("redis", 6379, 3)


def test_main_stops_on_keyboard_interrupt(queue_service):
    queue_service.start.side_effect = KeyboardInterrupt
    main.main()
    queue_service.stop.assert_called_once()


def test_main_exits_nonzero_on_fatal_error(queue_service):
    queue_service.start.side_effect = RuntimeError("redis unreachable")
    with pytest.raises(SystemExit) as exc:
        main.main()
    assert exc.value.code == 1
    queue_service.stop.assert_called_once()
