import os
import sys
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
)

logger = get_logger(__name__)


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
                logger.warning(f"Unsupported MIME type: {mime_type}, attempting OCR")
                return self._extract_from_image(file_path)
        except Exception as e:
            logger.error(f"Error extracting text from {file_path}", {"error": str(e)})
            raise
    
    def _extract_from_pdf(self, file_path: str) -> str:
        """Extract text from PDF file"""
        try:
            # Try to extract text directly first (for text-based PDFs)
            try:
                import PyPDF2
                with open(file_path, 'rb') as file:
                    pdf_reader = PyPDF2.PdfReader(file)
                    text = ""
                    for page in pdf_reader.pages:
                        text += (page.extract_text() or "") + "\n"
                    if text.strip():
                        return text.strip()
            except ImportError:
                logger.warning("PyPDF2 not installed, falling back to OCR for PDF")
            except Exception as e:
                logger.debug(f"Could not read PDF text layer, falling back to OCR: {e}")
            
            logger.info(f"PDF has no extractable text, using OCR: {file_path}")
            images = convert_from_path(file_path, dpi=OCR_DPI)
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
            image = Image.open(file_path)
            text = pytesseract.image_to_string(image, lang=self.tesseract_lang)
            return text.strip()
        except Exception as e:
            logger.error(f"Error processing image: {file_path}", {"error": str(e)})
            raise
    
    def _extract_from_docx(self, file_path: str) -> str:
        """Extract text from DOCX file"""
        try:
            doc = Document(file_path)
            text = "\n".join([paragraph.text for paragraph in doc.paragraphs])
            return text.strip()
        except Exception as e:
            logger.error(f"Error processing DOCX: {file_path}", {"error": str(e)})
            raise
