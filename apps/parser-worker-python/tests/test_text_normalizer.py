"""Tests for normalizers.text_normalizer."""
import pytest

import normalizers
from normalizers import (
    clean_whitespace,
    normalize_email,
    normalize_phone,
    normalize_text,
    remove_special_characters,
)


@pytest.mark.parametrize("fn", [normalize_text, clean_whitespace, remove_special_characters,
                                normalize_phone, normalize_email])
@pytest.mark.parametrize("empty", ["", None])
def test_empty_input_returns_empty_string(fn, empty):
    assert fn(empty) == ""


def test_package_exports():
    assert set(normalizers.__all__) == {
        "normalize_text", "clean_whitespace", "remove_special_characters", "normalize_phone", "normalize_email",
    }


# --------------------------------------------------------------------------- normalize_text


def test_normalize_text_preserves_line_structure_but_collapses_spaces():
    raw = "  Jane    Doe  \n\tSoftware\tEngineer \n\n\n\n\nExperience  \n"
    assert normalize_text(raw) == "Jane Doe\nSoftware Engineer\n\nExperience"


def test_normalize_text_keeps_single_blank_line_section_breaks():
    assert normalize_text("A\n\nB") == "A\n\nB"


def test_normalize_text_tab_then_space_leaves_double_space():
    # tabs are replaced *after* collapsing spaces, so "a\t b" keeps two spaces
    assert normalize_text("a\t b") == "a  b"


def test_normalize_text_whitespace_only():
    assert normalize_text(" \n \t \n ") == ""


# --------------------------------------------------------------------------- clean_whitespace


def test_clean_whitespace():
    assert clean_whitespace("  a   b \n\n\n\n  c  ") == "a b\n\nc"


# --------------------------------------------------------------------------- remove_special_characters


def test_remove_special_characters_keeps_contact_punctuation():
    assert remove_special_characters("jane@ex.com (415) 555-0123 #1 *star* C/C++") == \
        "jane@ex.com (415) 555-0123  1  star  C/C++"


def test_remove_special_characters_custom_preserve_set():
    assert remove_special_characters("a#b$c", preserve="#") == "a#b c"


# --------------------------------------------------------------------------- normalize_phone


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("415.555.0123", "(415) 555-0123"),
        ("(415) 555-0123", "(415) 555-0123"),
        ("1-415-555-0123", "+1 (415) 555-0123"),
        ("14155550123", "+1 (415) 555-0123"),
        ("+91 98765 43210", "+919876543210"),
        ("+44 7911 123456", "+447911123456"),
        ("555-0123", "5550123"),
    ],
)
def test_normalize_phone(raw, expected):
    assert normalize_phone(raw) == expected


# --------------------------------------------------------------------------- normalize_email


def test_normalize_email_lowercases_and_trims():
    assert normalize_email("  Jane.Doe@Example.COM ") == "jane.doe@example.com"
