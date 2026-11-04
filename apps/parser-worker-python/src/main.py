import os
import sys
import json
import signal
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from processors.resume_parser import ResumeParser
from services.queue_service import QueueService
from services.logger import get_logger
from services.db_service import DBService
from constants import (
    STATUS_PARSED,
    STATUS_FAILED,
    QUEUE_NAME,
    UPLOAD_SERVICE_URL_DEFAULT,
    MATCHER_ENDPOINT_PATH,
    REDIS_HOST_DEFAULT,
    REDIS_PORT_DEFAULT,
    PARSER_WORKER_CONCURRENCY_DEFAULT,
)

logger = get_logger(__name__)

def process_parse_job(job_data: dict) -> dict:
    """Process parsing job from queue"""
    resume_id = job_data.get('resumeId')
    extracted_text = job_data.get('extractedText')
    
    if not resume_id:
        raise ValueError("No resumeId provided in job data")
    
    if not extracted_text:
        raise ValueError("No extractedText provided in job data")
    
    logger.info(f"Parsing resume {resume_id}", {
        "resume_id": resume_id,
        "text_length": len(extracted_text)
    })
    
    try:
        parser = ResumeParser()
        parsed_data = parser.parse(extracted_text)
        
        # Save to database
        db_service = DBService()
        db_service.save_parsed_data(resume_id, parsed_data)
        db_service.update_resume_status(resume_id, STATUS_PARSED)

        try:
            import urllib.request
            upload_service_url = os.getenv("UPLOAD_SERVICE_URL", UPLOAD_SERVICE_URL_DEFAULT)
            url = f"{upload_service_url}{MATCHER_ENDPOINT_PATH}"
            data = json.dumps({'resumeId': resume_id}).encode('utf-8')
            
            headers = {'Content-Type': 'application/json'}
            # Shared secret the upload service requires on /api/internal/* (INTERNAL_API_TOKEN).
            internal_token = os.getenv("INTERNAL_API_TOKEN")
            if internal_token:
                headers['X-Internal-Token'] = internal_token
            req = urllib.request.Request(url, data=data, headers=headers)
            with urllib.request.urlopen(req, timeout=5) as response:
                if response.status == 200:
                    logger.info(f"Queued matcher job for resume {resume_id}")
                else:
                    logger.warning(f"Failed to queue matcher job: {response.status}")
        except Exception as e:
            logger.warning(f"Failed to queue matcher job: {e}")
        
        result = {
            "resumeId": resume_id,
            "parsedData": parsed_data,
            "status": "completed"
        }
        
        logger.info(f"Parsing completed for resume {resume_id}", {
            "resume_id": resume_id,
            "name": parsed_data.get('name'),
            "skills_count": len(parsed_data.get('skills', []))
        })
        
        return result
        
    except Exception as e:
        logger.error(f"Parsing failed for resume {resume_id}", {
            "error": str(e),
            "resume_id": resume_id
        })
        try:
            db_service = DBService()
            db_service.update_resume_status(resume_id, STATUS_FAILED)
        except:
            pass
        raise

def graceful_shutdown(signum, frame):
    """Handle graceful shutdown"""
    logger.info("Received shutdown signal, cleaning up...")
    DBService.close_pool()
    sys.exit(0)

def main():
    """Main worker loop"""
    logger.info("Starting Parser Worker")
    
    # Register signal handlers
    signal.signal(signal.SIGTERM, graceful_shutdown)
    signal.signal(signal.SIGINT, graceful_shutdown)
    
    redis_host = os.getenv("REDIS_HOST", REDIS_HOST_DEFAULT)
    redis_port = int(os.getenv("REDIS_PORT", str(REDIS_PORT_DEFAULT)))
    redis_password = os.getenv("REDIS_PASSWORD")
    concurrency = int(os.getenv("PARSER_WORKER_CONCURRENCY", str(PARSER_WORKER_CONCURRENCY_DEFAULT)))

    queue_service = QueueService(
        queue_name=QUEUE_NAME,
        redis_host=redis_host,
        redis_port=redis_port,
        redis_password=redis_password,
        processor=process_parse_job,
        concurrency=concurrency,
    )
    
    try:
        queue_service.start()
    except KeyboardInterrupt:
        logger.info("Shutting down Parser Worker")
        queue_service.stop()
    except Exception as e:
        logger.error(f"Fatal error in Parser Worker: {e}")
        queue_service.stop()
        sys.exit(1)
    finally:
        DBService.close_pool()
        logger.info("Parser Worker stopped")

if __name__ == '__main__':
    main()
