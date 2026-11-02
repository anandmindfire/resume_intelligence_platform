"""Queue service for Python workers using Redis.
Supports retry with exponential backoff on job failure."""
import redis
import json
import time
import signal
import sys
from typing import Callable, Dict, Any, Optional
from services.logger import get_logger

logger = get_logger(__name__)

# Default retry config (queue failures retried with backoff)
DEFAULT_MAX_ATTEMPTS = 3
DEFAULT_BACKOFF_DELAY_SECONDS = 5


class QueueService:
    """Service for consuming jobs from Redis queue with retry and backoff"""

    def __init__(
        self,
        queue_name: str,
        redis_host: str = 'redis',
        redis_port: int = 6379,
        redis_password: Optional[str] = None,
        processor: Optional[Callable] = None,
        concurrency: int = 1,
        max_attempts: int = DEFAULT_MAX_ATTEMPTS,
        backoff_delay_seconds: int = DEFAULT_BACKOFF_DELAY_SECONDS,
    ):
        self.queue_name = queue_name
        self.processor = processor
        self.concurrency = concurrency
        self.max_attempts = max_attempts
        self.backoff_delay_seconds = backoff_delay_seconds
        self.retry_set_key = f"{queue_name}:retry"
        self.running = False

        # Redis connection
        self.redis_client = redis.Redis(
            host=redis_host,
            port=redis_port,
            password=redis_password,
            decode_responses=True,
            socket_connect_timeout=5,
            socket_timeout=5,
            retry_on_timeout=True
        )

        # Register signal handlers for graceful shutdown
        signal.signal(signal.SIGTERM, self._signal_handler)
        signal.signal(signal.SIGINT, self._signal_handler)

    def _signal_handler(self, signum, frame):
        """Handle shutdown signals"""
        logger.info(f"Received signal {signum}, shutting down gracefully...")
        self.running = False
        sys.exit(0)

    def _process_job(self, job_data: Dict[str, Any]) -> Any:
        """Process a single job"""
        if not self.processor:
            raise ValueError("No processor function provided")

        try:
            result = self.processor(job_data)
            return result
        except Exception as e:
            logger.error(f"Job processing failed", {
                "error": str(e),
                "job_data": job_data
            })
            raise

    def _move_retry_jobs_back(self) -> bool:
        """Move up to one job from retry set (score <= now) back to main queue."""
        try:
            now = time.time()
            members = self.redis_client.zrangebyscore(
                self.retry_set_key, 0, now, start=0, num=1
            )
            if not members:
                return False
            job_json = members[0]
            self.redis_client.zrem(self.retry_set_key, job_json)
            self.redis_client.rpush(self.queue_name, job_json)
            job_data = json.loads(job_json)
            attempt = job_data.get('_attempt', 1)
            logger.info(f"Re-queued job for retry", {
                "queue": self.queue_name,
                "job_id": job_data.get('resumeId', 'unknown'),
                "attempt": attempt
            })
            return True
        except Exception as e:
            logger.error(f"Error moving retry job: {e}")
            return False

    def _consume_job(self) -> bool:
        """Consume a single job from the queue (or from retry set)."""
        try:
            self._move_retry_jobs_back()

            result = self.redis_client.blpop(self.queue_name, timeout=1)

            if result is None:
                return True

            _, job_json = result
            job_data = json.loads(job_json)
            attempt = job_data.pop('_attempt', 0)

            logger.info(f"Processing job from {self.queue_name}", {
                "queue": self.queue_name,
                "job_id": job_data.get('resumeId', 'unknown'),
                "attempt": attempt + 1
            })

            start_time = time.time()
            try:
                result = self._process_job(job_data)
            except Exception as e:
                duration = time.time() - start_time
                logger.error(f"Job failed", {
                    "queue": self.queue_name,
                    "job_id": job_data.get('resumeId', 'unknown'),
                    "duration": f"{duration:.2f}s",
                    "error": str(e),
                    "attempt": attempt + 1
                })

                if (attempt + 1) < self.max_attempts:
                    delay = self.backoff_delay_seconds * (2 ** attempt)
                    retry_at = time.time() + delay
                    payload = {**job_data, '_attempt': attempt + 1}
                    self.redis_client.zadd(
                        self.retry_set_key,
                        {json.dumps(payload): retry_at}
                    )
                    logger.info(f"Job scheduled for retry in {delay}s (attempt {attempt + 2}/{self.max_attempts})", {
                        "queue": self.queue_name,
                        "job_id": job_data.get('resumeId', 'unknown')
                    })
                else:
                    failed_queue = f"{self.queue_name}:failed"
                    self.redis_client.rpush(failed_queue, json.dumps({
                        "job": job_data,
                        "error": str(e),
                        "status": "failed",
                        "attempts": attempt + 1
                    }))
                return True

            duration = time.time() - start_time

            logger.info(f"Job completed successfully", {
                "queue": self.queue_name,
                "job_id": job_data.get('resumeId', 'unknown'),
                "duration": f"{duration:.2f}s"
            })

            # Publish the result separately: the job already succeeded, so a
            # publish failure must be logged but never retried/dead-lettered.
            try:
                result_queue = f"{self.queue_name}:results"
                self.redis_client.rpush(result_queue, json.dumps({
                    "job": job_data,
                    "result": result,
                    "status": "completed"
                }))
            except Exception as e:
                logger.error("Failed to publish job result", {
                    "queue": self.queue_name,
                    "job_id": job_data.get('resumeId', 'unknown'),
                    "error": str(e)
                })

            return True

        except redis.ConnectionError as e:
            logger.error(f"Redis connection error: {e}")
            time.sleep(5)
            return True
        except Exception as e:
            logger.error(f"Unexpected error in queue consumption: {e}")
            time.sleep(1)
            return True

    def start(self):
        """Start consuming jobs from the queue"""
        logger.info(f"Starting queue service for {self.queue_name}", {
            "queue": self.queue_name,
            "concurrency": self.concurrency
        })

        try:
            self.redis_client.ping()
            logger.info("Redis connection established")
        except Exception as e:
            logger.error(f"Failed to connect to Redis: {e}")
            raise

        self.running = True

        while self.running:
            try:
                self._consume_job()
            except KeyboardInterrupt:
                logger.info("Keyboard interrupt received")
                break
            except Exception as e:
                logger.error(f"Error in main loop: {e}")
                if not self.running:
                    break
                time.sleep(1)

    def stop(self):
        """Stop consuming jobs"""
        logger.info(f"Stopping queue service for {self.queue_name}")
        self.running = False
        if self.redis_client:
            self.redis_client.close()
