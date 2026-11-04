"""Configuration and MIME constants for OCR worker."""

# MIME types
MIME_PDF = "application/pdf"
MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
MIME_TYPES_IMAGE = ("image/jpeg", "image/png", "image/jpg")

# Tesseract
TESSERACT_CMD_DEFAULT = "/usr/bin/tesseract"
TESSERACT_LANG_DEFAULT = "eng"

# OCR settings
OCR_DPI = 300

# Resource limits for untrusted uploads (a resume never needs more than this)
OCR_MAX_PDF_PAGES = 20                     # pages rendered/OCR'd per PDF
OCR_MAX_IMAGE_PIXELS = 50_000_000          # ~7000x7000; larger images are treated as decompression bombs
DOCX_MAX_ENTRIES = 1000                    # zip members in a DOCX
DOCX_MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024
DOCX_MAX_COMPRESSION_RATIO = 100

# Uploaded files must live under this directory (UPLOAD_DIRECTORY overrides)
UPLOAD_DIRECTORY_DEFAULT = "/app/uploads"

# Queues
QUEUE_NAME = "ocr-queue"
PARSER_QUEUE_NAME = "parser-queue"

# Environment defaults
REDIS_HOST_DEFAULT = "redis"
REDIS_PORT_DEFAULT = 6379
OCR_WORKER_CONCURRENCY_DEFAULT = 3
