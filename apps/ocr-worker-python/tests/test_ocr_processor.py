"""Tests for processors.ocr_processor.OCRProcessor.

Tesseract and poppler are never invoked: pytesseract.image_to_string and
pdf2image.convert_from_path are patched. Real PNG and DOCX files are generated
in tmp_path with Pillow / python-docx so the non-OCR code paths run for real.
"""
import importlib.util
import logging
import sys
import types
from unittest.mock import MagicMock

import pytest
from docx import Document
from PIL import Image

from constants import MIME_DOCX, MIME_PDF, OCR_DPI
from processors import ocr_processor as op_module
from processors.ocr_processor import OCRProcessor


@pytest.fixture
def tesseract(monkeypatch):
    """Patch the OCR engine; returns the mock so tests can set return values."""
    mock = MagicMock(name="image_to_string", return_value="  OCR TEXT \n")
    monkeypatch.setattr(op_module.pytesseract, "image_to_string", mock)
    return mock


@pytest.fixture
def convert(monkeypatch):
    mock = MagicMock(name="convert_from_path")
    monkeypatch.setattr(op_module, "convert_from_path", mock)
    return mock


@pytest.fixture
def no_pypdf2(monkeypatch):
    """Simulate PyPDF2 not being installed (the production image state)."""
    monkeypatch.setitem(sys.modules, "PyPDF2", None)


def _fake_pypdf2(monkeypatch, page_texts):
    pages = []
    for text in page_texts:
        page = MagicMock()
        page.extract_text.return_value = text
        pages.append(page)
    module = types.ModuleType("PyPDF2")
    module.PdfReader = MagicMock(return_value=MagicMock(pages=pages))
    monkeypatch.setitem(sys.modules, "PyPDF2", module)
    return module


@pytest.fixture
def png_file(tmp_path):
    path = tmp_path / "scan.png"
    Image.new("RGB", (20, 20), color="white").save(path)
    return str(path)


@pytest.fixture
def pdf_file(tmp_path):
    path = tmp_path / "resume.pdf"
    path.write_bytes(b"%PDF-1.4 fake")
    return str(path)


@pytest.fixture
def docx_file(tmp_path):
    path = tmp_path / "resume.docx"
    doc = Document()
    for line in ["Jane Doe", "jane@example.com", "", "Experience", "Engineer at Acme"]:
        doc.add_paragraph(line)
    doc.save(path)
    return str(path)


# --------------------------------------------------------------------------- __init__


def test_init_uses_tesseract_cmd_from_env_when_binary_exists(monkeypatch, tmp_path):
    fake_bin = tmp_path / "tesseract"
    fake_bin.write_text("#!/bin/sh\n")
    monkeypatch.setattr(op_module.pytesseract.pytesseract, "tesseract_cmd", "orig")
    monkeypatch.setenv("TESSERACT_CMD", str(fake_bin))

    OCRProcessor()
    assert op_module.pytesseract.pytesseract.tesseract_cmd == str(fake_bin)


def test_init_leaves_tesseract_cmd_alone_when_binary_missing(monkeypatch, tmp_path):
    monkeypatch.setattr(op_module.pytesseract.pytesseract, "tesseract_cmd", "orig")
    monkeypatch.setenv("TESSERACT_CMD", str(tmp_path / "nope"))

    OCRProcessor()
    assert op_module.pytesseract.pytesseract.tesseract_cmd == "orig"


def test_init_language_defaults_to_english_and_is_configurable(monkeypatch):
    assert OCRProcessor().tesseract_lang == "eng"
    monkeypatch.setenv("TESSERACT_LANG", "deu+eng")
    assert OCRProcessor().tesseract_lang == "deu+eng"


# --------------------------------------------------------------------------- dispatch


def test_extract_text_missing_file_raises(tmp_path):
    with pytest.raises(FileNotFoundError, match="File not found"):
        OCRProcessor().extract_text(str(tmp_path / "missing.pdf"), MIME_PDF)


@pytest.mark.parametrize(
    "mime, method",
    [
        (MIME_PDF, "_extract_from_pdf"),
        ("image/jpeg", "_extract_from_image"),
        ("image/png", "_extract_from_image"),
        ("image/jpg", "_extract_from_image"),
        (MIME_DOCX, "_extract_from_docx"),
    ],
)
def test_extract_text_dispatches_on_mime_type(monkeypatch, png_file, mime, method):
    proc = OCRProcessor()
    called = MagicMock(return_value="ok")
    monkeypatch.setattr(proc, method, called)
    assert proc.extract_text(png_file, mime) == "ok"
    called.assert_called_once_with(png_file)


def test_extract_text_unknown_mime_falls_back_to_ocr(png_file, tesseract, caplog):
    with caplog.at_level(logging.WARNING):
        text = OCRProcessor().extract_text(png_file, "application/octet-stream")
    assert text == "OCR TEXT"
    assert "Unsupported MIME type" in caplog.text


def test_extract_text_propagates_extractor_errors(monkeypatch, png_file, caplog):
    proc = OCRProcessor()
    monkeypatch.setattr(proc, "_extract_from_image", MagicMock(side_effect=RuntimeError("tesseract died")))
    with caplog.at_level(logging.ERROR), pytest.raises(RuntimeError, match="tesseract died"):
        proc.extract_text(png_file, "image/png")
    assert "Error extracting text" in caplog.text


# --------------------------------------------------------------------------- images


def test_extract_from_image_runs_tesseract_with_configured_language(monkeypatch, png_file, tesseract):
    monkeypatch.setenv("TESSERACT_LANG", "fra")
    assert OCRProcessor()._extract_from_image(png_file) == "OCR TEXT"
    image_arg = tesseract.call_args.args[0]
    assert isinstance(image_arg, Image.Image)
    assert tesseract.call_args.kwargs == {"lang": "fra"}


def test_extract_from_image_rejects_non_image(tmp_path, tesseract):
    bogus = tmp_path / "not-an-image.png"
    bogus.write_text("hello")
    with pytest.raises(Exception):
        OCRProcessor()._extract_from_image(str(bogus))
    tesseract.assert_not_called()


# --------------------------------------------------------------------------- PDFs


def test_pdf_without_pypdf2_is_ocrd_page_by_page(pdf_file, tesseract, convert, no_pypdf2):
    convert.return_value = ["page1", "page2"]
    tesseract.side_effect = ["First page", "Second page\n"]

    text = OCRProcessor()._extract_from_pdf(pdf_file)

    assert text == "First page\nSecond page"
    convert.assert_called_once_with(pdf_file, dpi=OCR_DPI)
    assert [c.args[0] for c in tesseract.call_args_list] == ["page1", "page2"]
    assert all(c.kwargs == {"lang": "eng"} for c in tesseract.call_args_list)


def test_pdf_with_text_layer_skips_ocr(monkeypatch, pdf_file, tesseract, convert):
    _fake_pypdf2(monkeypatch, ["Jane Doe ", "Engineer"])
    assert OCRProcessor()._extract_from_pdf(pdf_file) == "Jane Doe \nEngineer"
    convert.assert_not_called()
    tesseract.assert_not_called()


def test_pdf_with_blank_text_layer_falls_back_to_ocr(monkeypatch, pdf_file, tesseract, convert):
    _fake_pypdf2(monkeypatch, ["", "   "])
    convert.return_value = ["img"]
    assert OCRProcessor()._extract_from_pdf(pdf_file) == "OCR TEXT"
    convert.assert_called_once()


def test_pdf_page_returning_none_falls_back_to_ocr(monkeypatch, pdf_file, tesseract, convert):
    _fake_pypdf2(monkeypatch, [None])
    convert.return_value = ["img"]
    assert OCRProcessor()._extract_from_pdf(pdf_file) == "OCR TEXT"


def test_pdf_with_no_pages_returns_empty_string(pdf_file, tesseract, convert, no_pypdf2):
    convert.return_value = []
    assert OCRProcessor()._extract_from_pdf(pdf_file) == ""


def test_pdf_conversion_errors_propagate(pdf_file, convert, no_pypdf2):
    convert.side_effect = RuntimeError("poppler not installed")
    with pytest.raises(RuntimeError, match="poppler"):
        OCRProcessor()._extract_from_pdf(pdf_file)


def test_extract_text_end_to_end_for_pdf(pdf_file, tesseract, convert, no_pypdf2):
    convert.return_value = ["img"]
    assert OCRProcessor().extract_text(pdf_file, MIME_PDF) == "OCR TEXT"


@pytest.mark.xfail(
    reason="BUG: ocr_processor.py:56 imports PyPDF2 for the text-layer fast path, but PyPDF2 is not in "
    "requirements.txt, so the ImportError is swallowed by the bare except and every PDF is "
    "rasterised and OCR'd at 300 DPI (slow, lossy) even when it has a text layer.",
    strict=True,
)
def test_pypdf2_dependency_is_declared():
    assert importlib.util.find_spec("PyPDF2") is not None


# --------------------------------------------------------------------------- DOCX


def test_extract_from_docx_reads_real_document(docx_file):
    text = OCRProcessor()._extract_from_docx(docx_file)
    assert text == "Jane Doe\njane@example.com\n\nExperience\nEngineer at Acme"


def test_extract_text_end_to_end_for_docx(docx_file, tesseract):
    assert OCRProcessor().extract_text(docx_file, MIME_DOCX).startswith("Jane Doe")
    tesseract.assert_not_called()


def test_extract_from_empty_docx_returns_empty_string(tmp_path):
    path = tmp_path / "empty.docx"
    Document().save(path)
    assert OCRProcessor()._extract_from_docx(str(path)) == ""


def test_extract_from_corrupt_docx_raises(tmp_path):
    path = tmp_path / "corrupt.docx"
    path.write_bytes(b"this is not a zip file")
    with pytest.raises(Exception):
        OCRProcessor()._extract_from_docx(str(path))
