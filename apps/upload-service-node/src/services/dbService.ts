import { Pool } from 'pg';
import { config } from '@resume-platform/config';
import type { ResumeRecord } from '../types';
import { DB_POOL } from '../constants';
import {
  INSERT_RESUME,
  GET_RESUME_BY_ID,
  UPDATE_RESUME_STATUS,
  DELETE_RESUME,
} from '../queries';

const poolMax = config.database.poolMax ?? 20;

const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  user: config.database.user,
  password: config.database.password,
  database: config.database.database,
  max: poolMax,
  idleTimeoutMillis: DB_POOL.IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: DB_POOL.CONNECTION_TIMEOUT_MS,
});

class DbService {
  async createResume(data: {
    id: string;
    fileName: string;
    filePath: string;
    mimeType: string;
    fileSize: number;
    status: string;
  }): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query(INSERT_RESUME, [
        data.id,
        data.fileName,
        data.filePath,
        data.mimeType,
        data.fileSize,
        data.status,
      ]);
    } finally {
      client.release();
    }
  }

  async getResume(id: string): Promise<ResumeRecord | null> {
    const client = await pool.connect();
    try {
      const result = await client.query(GET_RESUME_BY_ID, [id]);
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  async updateResumeStatus(id: string, status: string): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query(UPDATE_RESUME_STATUS, [status, id]);
    } finally {
      client.release();
    }
  }

  async deleteResume(id: string): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query(DELETE_RESUME, [id]);
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await pool.end();
  }
}

export const dbService = new DbService();

process.on('SIGTERM', async () => {
  await dbService.close();
});
