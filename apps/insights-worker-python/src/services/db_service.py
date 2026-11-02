"""Database service for Insights worker"""
import os
import psycopg2
from psycopg2 import pool
from psycopg2.extras import RealDictCursor
from typing import Dict, Any, Optional, List

from services.logger import get_logger
from constants import DEFAULT_TOP_SKILLS_LIMIT, STATUS_MATCHED
from queries import GET_RESUME_COUNT, GET_PROCESSED_COUNT, GET_TOP_SKILLS

logger = get_logger(__name__)


class DBService:
    """Database service for PostgreSQL operations"""

    _connection_pool: Optional[pool.ThreadedConnectionPool] = None

    @classmethod
    def _get_pool(cls):
        """Get or create connection pool"""
        if cls._connection_pool is None:
            try:
                cls._connection_pool = pool.ThreadedConnectionPool(
                    minconn=1,
                    maxconn=5,
                    host=os.getenv("POSTGRES_HOST", "postgres"),
                    port=int(os.getenv("POSTGRES_PORT", "5432")),
                    user=os.getenv("POSTGRES_USER", "postgres"),
                    password=os.getenv("POSTGRES_PASSWORD", "postgres"),
                    database=os.getenv("POSTGRES_DB", "resume_db"),
                    connect_timeout=5,
                )
                logger.info("Database connection pool created")
            except Exception as e:
                logger.error(f"Failed to create database connection pool: {e}")
                raise
        return cls._connection_pool

    @classmethod
    def _get_connection(cls):
        """Get connection from pool"""
        pool_inst = cls._get_pool()
        return pool_inst.getconn()

    @classmethod
    def _return_connection(cls, conn):
        """Return connection to pool"""
        pool_inst = cls._get_pool()
        pool_inst.putconn(conn)

    def get_resume_count(self) -> int:
        """Get total resume count"""
        conn = None
        cursor = None
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            cursor.execute(GET_RESUME_COUNT)
            result = cursor.fetchone()
            return result[0] if result else 0
        except Exception as e:
            logger.error(f"Failed to get resume count: {e}")
            raise
        finally:
            try:
                if cursor:
                    cursor.close()
            finally:
                if conn:
                    self._return_connection(conn)

    def get_processed_count(self) -> int:
        """Get count of processed resumes"""
        conn = None
        cursor = None
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            cursor.execute(GET_PROCESSED_COUNT, (STATUS_MATCHED,))
            result = cursor.fetchone()
            return result[0] if result else 0
        except Exception as e:
            logger.error(f"Failed to get processed count: {e}")
            raise
        finally:
            try:
                if cursor:
                    cursor.close()
            finally:
                if conn:
                    self._return_connection(conn)

    def get_top_skills(self, limit: int = DEFAULT_TOP_SKILLS_LIMIT) -> List[Dict[str, Any]]:
        """Get top skills"""
        conn = None
        cursor = None
        try:
            conn = self._get_connection()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute(GET_TOP_SKILLS, (limit,))
            return cursor.fetchall()
        except Exception as e:
            logger.error(f"Failed to get top skills: {e}")
            raise
        finally:
            try:
                if cursor:
                    cursor.close()
            finally:
                if conn:
                    self._return_connection(conn)

    @classmethod
    def close_pool(cls):
        """Close all connections in pool"""
        if cls._connection_pool:
            cls._connection_pool.closeall()
            cls._connection_pool = None
            logger.info("Database connection pool closed")
