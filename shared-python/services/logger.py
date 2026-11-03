import logging
import os
import json
from datetime import datetime


def get_logger(name: str) -> logging.Logger:
    """Get configured logger.

    Structured context can be attached by passing a single dict after the
    message, e.g. ``logger.info("Processing job", {"resume_id": "r1"})``.
    """
    logger = logging.getLogger(name)

    if not logger.handlers:
        handler = logging.StreamHandler()

        log_format = os.getenv('LOG_FORMAT', 'json')
        log_level = os.getenv('LOG_LEVEL', 'INFO')

        if log_format == 'json':
            handler.setFormatter(JsonFormatter())
        else:
            handler.setFormatter(TextFormatter(
                '%(asctime)s [%(name)s] %(levelname)s: %(message)s'
            ))

        logger.addHandler(handler)
        logger.setLevel(getattr(logging, log_level.upper()))

    return logger


def _context_of(record: logging.LogRecord):
    """Return the structured context dict passed as the sole logging arg, if any."""
    return record.args if isinstance(record.args, dict) else None


def _message_of(record: logging.LogRecord) -> str:
    """Message text; a dict arg is context, not %-format arguments."""
    if _context_of(record) is not None:
        return str(record.msg)
    return record.getMessage()


class JsonFormatter(logging.Formatter):
    """JSON formatter for logs"""

    def format(self, record):
        log_data = {
            'timestamp': datetime.utcnow().isoformat(),
            'level': record.levelname,
            'logger': record.name,
            'message': _message_of(record),
        }

        context = _context_of(record)
        if context:
            log_data['context'] = context

        if record.exc_info:
            log_data['exception'] = self.formatException(record.exc_info)

        if hasattr(record, 'service'):
            log_data['service'] = record.service

        return json.dumps(log_data, default=str)


class TextFormatter(logging.Formatter):
    """Plain-text formatter that also renders structured context."""

    def format(self, record):
        context = _context_of(record)
        if context is None:
            return super().format(record)
        record = logging.makeLogRecord({**record.__dict__, 'msg': _message_of(record) + f" {json.dumps(context, default=str)}", 'args': None})
        return super().format(record)
