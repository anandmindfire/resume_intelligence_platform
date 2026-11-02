"""Tests for the constants package (re-exports and config contract)."""
import constants
from constants import config


def test_package_reexports_every_config_value():
    assert constants.__all__
    for name in constants.__all__:
        assert getattr(constants, name) == getattr(config, name)


def test_business_defaults():
    assert isinstance(constants.DEFAULT_TOP_SKILLS_LIMIT, int) and constants.DEFAULT_TOP_SKILLS_LIMIT > 0
    assert constants.STATUS_MATCHED == "matched"
    assert constants.QUEUE_NAME == "insights-queue"


def test_env_defaults():
    assert isinstance(constants.REDIS_PORT_DEFAULT, int)
    assert constants.INSIGHTS_WORKER_CONCURRENCY_DEFAULT >= 1
