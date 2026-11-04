import os
import sys
import warnings
import zipfile
from pathlib import Path
import pytesseract
from PIL import Image
from pdf2image import convert_from_path
from docx import Document

sys.path.insert(0, str(Path(__file__).parent.parent))
from services.logger import get_logger
from constants import (
    MIME_PDF,
    MIME_DOCX,
    MIME_TYPES_IMAGE,
    TESSERACT_CMD_DEFAULT,
    TESSERACT_LANG_DEFAULT,
    OCR_DPI,
    OCR_MAX_PDF_PAGES,
    OCR_MAX_IMAGE_PIXELS,
    DOCX_MAX_ENTRIES,
    DOCX_MAX_UNCOMPRESSED_BYTES,
    DOCX_MAX_COMPRESSION_RATIO,
)

logger = get_logger(__name__)

# Uploads are untrusted: refuse images that would decode to an enormous bitmap (decompression bombs).
# Pillow raises DecompressionBombError above 2x this value and only warns between 1x and 2x, so the
# warning is promoted to an error too.
Image.MAX_IMAGE_PIXELS = OCR_MAX_IMAGE_PIXELS
warnings.simplefilter("error", Image.DecompressionBombWarning)


class UnsafeDocumentError(ValueError):
    """The file exceeds the resource limits applied to untrusted uploads."""


def check_docx_archive(file_path: str) -> None:
    """Reject DOCX archives that would expand far beyond their size (zip bombs) before unpacking them."""
    with zipfile.ZipFile(file_path) as archive:
        members = archive.infolist()
        if len(members) > DOCX_MAX_ENTRIES:
            raise UnsafeDocumentError("DOCX archive contains too many entries")
        total = 0
        for member in members:
            total += member.file_size
            if total > DOCX_MAX_UNCOMPRESSED_BYTES:
                raise UnsafeDocumentError("DOCX archive expands beyond the allowed size")
            if member.compress_size and member.file_size / member.compress_size > DOCX_MAX_COMPRESSION_RATIO:
                raise UnsafeDocumentError("DOCX archive has a suspicious compression ratio")


class OCRProcessor:
    """Process OCR extraction from various file formats"""

    def __init__(self):
        tesseract_cmd = os.getenv("TESSERACT_CMD", TESSERACT_CMD_DEFAULT)
        if os.path.exists(tesseract_cmd):
            pytesseract.pytesseract.tesseract_cmd = tesseract_cmd
        self.tesseract_lang = os.getenv("TESSERACT_LANG", TESSERACT_LANG_DEFAULT)

    def extract_text(self, file_path: str, mime_type: str) -> str:
        """Extract text from file based on MIME type"""
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")

        try:
            if mime_type == MIME_PDF:
                return self._extract_from_pdf(file_path)
            elif mime_type in MIME_TYPES_IMAGE:
                return self._extract_from_image(file_path)
            elif mime_type == MIME_DOCX:
                return self._extract_from_docx(file_path)
            else:
                # Never guess: feeding an unknown format to a parser widens the attack surface.
                logger.warning(f"Unsupported MIME type: {mime_type}, rejecting")
                raise ValueError(f"Unsupported MIME type: {mime_type}")
        except Exception as e:
            logger.error(f"Error extracting text from {file_path}", {"error": str(e)})
            raise
    
    def _extract_from_pdf(self, file_path: str) -> str:
        """Extract text from PDF file"""
        try:
            # Try to extract text directly first (for text-based PDFs)
            try:
                import pypdf
                with open(file_path, 'rb') as file:
                    pdf_reader = pypdf.PdfReader(file)
                    text = ""
                    for page in pdf_reader.pages[:OCR_MAX_PDF_PAGES]:
                        text += (page.extract_text() or "") + "\n"
                    if text.strip():
                        return text.strip()
            except ImportError:
                logger.warning("pypdf not installed, falling back to OCR for PDF")
            except Exception as e:
                logger.debug(f"Could not read PDF text layer, falling back to OCR: {e}")
            
            logger.info(f"PDF has no extractable text, using OCR: {file_path}")
            # Bound the work an uploaded PDF can cause: render at most OCR_MAX_PDF_PAGES pages.
            images = convert_from_path(file_path, dpi=OCR_DPI, first_page=1, last_page=OCR_MAX_PDF_PAGES)
            text = ""
            for image in images:
                text += pytesseract.image_to_string(image, lang=self.tesseract_lang) + "\n"
            return text.strip()
        except Exception as e:
            logger.error(f"Error processing PDF: {file_path}", {"error": str(e)})
            raise
    
    def _extract_from_image(self, file_path: str) -> str:
        """Extract text from image using OCR"""
        try:
            with Image.open(file_path) as image:
                text = pytesseract.image_to_string(image, lang=self.tesseract_lang)
            return text.strip()
        except Exception as e:
            logger.error(f"Error processing image: {file_path}", {"error": str(e)})
            raise
    
    def _extract_from_docx(self, file_path: str) -> str:
        """Extract text from DOCX file"""
        try:
            check_docx_archive(file_path)
            doc = Document(file_path)
            text = "\n".join([paragraph.text for paragraph in doc.paragraphs])
            return text.strip()
        except Exception as e:
            logger.error(f"Error processing DOCX: {file_path}", {"error": str(e)})
            raise
