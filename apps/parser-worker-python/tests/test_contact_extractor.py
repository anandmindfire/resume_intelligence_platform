"""Tests for extractors.contact_extractor."""
import pytest

from extractors.contact_extractor import extract_contact_info, extract_email, extract_phone


# --------------------------------------------------------------------------- email


@pytest.mark.parametrize(
    "text, expected",
    [
        ("Jane Doe\njane.doe@example.com", "jane.doe@example.com"),
        ("Contact: John.Smith+jobs@Mail.Example.co.uk", "John.Smith+jobs@Mail.Example.co.uk"),
        ("first@a.io, second@b.io", "first@a.io"),
        ("Email:dev_ops-1@sub.company.org | Phone", "dev_ops-1@sub.company.org"),
    ],
)
def test_extract_email(text, expected):
    assert extract_email(text) == expected


def test_email_does_not_swallow_pipe_delimiter():
    assert extract_email("jane@acme.org|Phone: 555") == "jane@acme.org"


@pytest.mark.parametrize("text", ["", None, "john at example dot com", "@handle on twitter", "a@b"])
def test_extract_email_none(text):
    assert extract_email(text) is None


# --------------------------------------------------------------------------- phone


@pytest.mark.parametrize(
    "text, expected",
    [
        ("Jane | (415) 555-0123 | SF", "4155550123"),
        ("415.555.0123", "4155550123"),
        ("+14155550123", "+14155550123"),
        ("Phone: +91 98765 43210", "+919876543210"),
        ("Mobile: +44 7911 123456", "+447911123456"),
        ("Tel: 020-7946-0958 x", "02079460958"),
        ("PH: (212) 555 7788", "2125557788"),
    ],
)
def test_extract_phone_formats(text, expected):
    assert extract_phone(text) == expected


def test_labeled_phone_takes_precedence_over_earlier_numbers():
    text = "ID 9998887776665\nMobile: 415-555-0123"
    assert extract_phone(text) == "4155550123"


@pytest.mark.parametrize(
    "text",
    ["", None, "ph: 123", "Born 1990, graduated 2012", "Jan 2015 - Dec 2019", "Revenue grew 40% to $12,000"],
)
def test_extract_phone_none(text):
    assert extract_phone(text) is None


def test_unlabeled_phone_ending_in_year_like_digits():
    assert extract_phone("Jane Doe | 415-555-2001 | jane@x.com") == "4155552001"


def test_extract_contact_info_combines_both(sample_resume):
    assert extract_contact_info(sample_resume) == {"email": "jane.doe@example.com", "phone": "4155550123"}


def test_extract_contact_info_empty():
    assert extract_contact_info("") == {"email": None, "phone": None}


@pytest.mark.parametrize("text", ["2015 2019 2021 2023", "2015-2019-2020-2021"])
def test_run_of_years_is_not_a_phone(text):
    assert extract_phone(text) is None
