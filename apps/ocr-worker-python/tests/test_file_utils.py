"""Tests for utils.file_utils."""
import pytest

from utils.file_utils import (
    ensure_directory_exists,
    get_file_extension,
    get_file_size,
    is_valid_file,
    sanitize_filename,
)


def test_ensure_directory_exists_creates_nested_parents(tmp_path):
    target = tmp_path / "a" / "b" / "file.txt"
    ensure_directory_exists(str(target))
    assert (tmp_path / "a" / "b").is_dir()
    assert not target.exists()


def test_ensure_directory_exists_is_idempotent(tmp_path):
    target = tmp_path / "dir" / "f.txt"
    ensure_directory_exists(str(target))
    ensure_directory_exists(str(target))
    assert target.parent.is_dir()


def test_ensure_directory_exists_with_bare_filename_is_noop(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    ensure_directory_exists("file.txt")
    assert list(tmp_path.iterdir()) == []


@pytest.mark.parametrize(
    "path, ext",
    [
        ("resume.PDF", ".pdf"),
        ("/x/y/scan.jpeg", ".jpeg"),
        ("archive.tar.gz", ".gz"),
        ("README", ""),
        (".bashrc", ""),
    ],
)
def test_get_file_extension(path, ext):
    assert get_file_extension(path) == ext


def test_is_valid_file(tmp_path):
    f = tmp_path / "f.txt"
    f.write_text("x")
    assert is_valid_file(str(f)) is True
    assert is_valid_file(str(tmp_path)) is False
    assert is_valid_file(str(tmp_path / "missing")) is False


def test_get_file_size(tmp_path):
    f = tmp_path / "f.bin"
    f.write_bytes(b"12345")
    assert get_file_size(str(f)) == 5
    assert get_file_size(str(tmp_path / "missing")) == 0
    assert get_file_size(str(tmp_path)) == 0


@pytest.mark.parametrize(
    "raw, clean",
    [
        ('my<resume>:"v2"/final\\|?*.pdf', "my_resume___v2__final____.pdf"),
        ("jane doe - cv.docx", "jane doe - cv.docx"),
        ("", ""),
    ],
)
def test_sanitize_filename(raw, clean):
    assert sanitize_filename(raw) == clean
