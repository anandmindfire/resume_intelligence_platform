"""Database service for Parser worker"""
import os
import psycopg2
from psycopg2 import pool
from psycopg2.extras import Json
from typing import Dict, Any, Optional

from services.logger import get_logger
from queries import UPDATE_RESUME_PARSED_DATA, UPDATE_RESUME_STATUS

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
                    maxconn=10,
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

    def save_parsed_data(self, resume_id: str, parsed_data: Dict[str, Any]) -> None:
        """Save parsed resume data to database"""
        conn = None
        cursor = None
        try:
            conn = self._get_connection()
            cursor = conn.cursor()

            skills_list = parsed_data.get("skills", [])
            if not isinstance(skills_list, list):
                skills_list = []

            full_parsed_data = {
                "name": parsed_data.get("name"),
                "email": parsed_data.get("email"),
                "phone": parsed_data.get("phone"),
                "skills": parsed_data.get("skills", []),
                "experience": parsed_data.get("experience", []),
                "education": parsed_data.get("education", []),
                "projects": parsed_data.get("projects", []),
                "achievements": parsed_data.get("achievements", []),
                "rawText": parsed_data.get("rawText", ""),
            }

            cursor.execute(
                UPDATE_RESUME_PARSED_DATA,
                (
                    parsed_data.get("name"),
                    parsed_data.get("email"),
                    parsed_data.get("phone"),
                    skills_list,
                    Json(parsed_data.get("experience", [])),
                    Json(parsed_data.get("education", [])),
                    Json(full_parsed_data),
                    resume_id,
                ),
            )

            conn.commit()
            logger.info(f"Saved parsed data for resume {resume_id}")

        except Exception as e:
            if conn:
                conn.rollback()
            logger.error(f"Failed to save parsed data for resume {resume_id}: {e}")
            raise
        finally:
            try:
                if cursor:
                    cursor.close()
            finally:
                if conn:
                    self._return_connection(conn)

    def update_resume_status(self, resume_id: str, status: str) -> None:
        """Update resume status"""
        conn = None
        cursor = None
        try:
            conn = self._get_connection()
            cursor = conn.cursor()

            cursor.execute(UPDATE_RESUME_STATUS, (status, resume_id))

            conn.commit()
            logger.info(f"Updated resume {resume_id} status to {status}")

        except Exception as e:
            if conn:
                conn.rollback()
            logger.error(f"Failed to update resume status: {e}")
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
