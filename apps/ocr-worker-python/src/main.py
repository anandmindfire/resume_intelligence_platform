import os
import sys
import json
from typing import Dict, Any
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from processors.ocr_processor import OCRProcessor
from services.queue_service import QueueService
from services.logger import get_logger
from constants import (
    QUEUE_NAME,
    PARSER_QUEUE_NAME,
    REDIS_HOST_DEFAULT,
    REDIS_PORT_DEFAULT,
    OCR_WORKER_CONCURRENCY_DEFAULT,
    UPLOAD_DIRECTORY_DEFAULT,
)

logger = get_logger(__name__)


def resolve_upload_path(file_path) -> str:
    """
    Return the real path of an uploaded file, refusing anything outside the uploads directory.

    Queue messages are only as trustworthy as everyone who can write to Redis, so a job must not be
    able to point the worker at arbitrary files (e.g. /etc/passwd or another tenant's data). Symlinks
    are resolved before the check.
    """
    if not isinstance(file_path, str) or not file_path:
        raise ValueError("Job has no filePath")
    root = Path(os.getenv("UPLOAD_DIRECTORY", UPLOAD_DIRECTORY_DEFAULT)).resolve()
    resolved = Path(file_path).resolve()
    if resolved == root or root not in resolved.parents:
        raise ValueError("filePath is outside the uploads directory")
    return str(resolved)

def process_ocr_job(job_data: Dict[str, Any]) -> Dict[str, Any]:
    """Process OCR job from queue"""
    try:
        resume_id = job_data.get('resumeId')
        file_path = job_data.get('filePath')
        mime_type = job_data.get('mimeType')
        
        logger.info(f"Processing OCR job for resume {resume_id}", {
            "resume_id": resume_id,
            "file_path": file_path,
            "mime_type": mime_type
        })
        
        safe_path = resolve_upload_path(file_path)
        processor = OCRProcessor()
        extracted_text = processor.extract_text(safe_path, mime_type)
        
        if not extracted_text:
            raise ValueError("No text extracted from file")
        
        try:
            import redis
            redis_client = redis.Redis(
                host=os.getenv("REDIS_HOST", REDIS_HOST_DEFAULT),
                port=int(os.getenv("REDIS_PORT", str(REDIS_PORT_DEFAULT))),
                password=os.getenv("REDIS_PASSWORD"),
                decode_responses=True,
            )
            redis_client.rpush(PARSER_QUEUE_NAME, json.dumps({
                'resumeId': resume_id,
                'extractedText': extracted_text,
                'filePath': file_path,
                'fileName': job_data.get('fileName', ''),
                'mimeType': mime_type
            }))
            logger.info(f"Queued parser job for resume {resume_id}")
        except Exception as e:
            logger.warning(f"Failed to queue parser job: {e}")
        
        result = {
            "resumeId": resume_id,
            "extractedText": extracted_text,
            "status": "completed"
        }
        
        logger.info(f"OCR completed for resume {resume_id}", {
            "resume_id": resume_id,
            "text_length": len(extracted_text)
        })
        
        return result
        
    except Exception as e:
        logger.error(f"OCR processing failed for resume {job_data.get('resumeId')}", {
            "error": str(e),
            "resume_id": job_data.get('resumeId')
        })
        raise

def main():
    """Main worker loop"""
    logger.info("Starting OCR Worker")
    
    redis_host = os.getenv("REDIS_HOST", REDIS_HOST_DEFAULT)
    redis_port = int(os.getenv("REDIS_PORT", str(REDIS_PORT_DEFAULT)))
    redis_password = os.getenv("REDIS_PASSWORD")
    concurrency = int(os.getenv("OCR_WORKER_CONCURRENCY", str(OCR_WORKER_CONCURRENCY_DEFAULT)))

    queue_service = QueueService(
        queue_name=QUEUE_NAME,
        redis_host=redis_host,
        redis_port=redis_port,
        redis_password=redis_password,
        processor=process_ocr_job,
        concurrency=concurrency,
    )
    
    try:
        queue_service.start()
    except KeyboardInterrupt:
        logger.info("Shutting down OCR Worker")
        queue_service.stop()
    except Exception as e:
        logger.error(f"Fatal error in OCR Worker: {e}")
        queue_service.stop()
        sys.exit(1)
    finally:
        logger.info("OCR Worker stopped")

if __name__ == '__main__':
    main()
