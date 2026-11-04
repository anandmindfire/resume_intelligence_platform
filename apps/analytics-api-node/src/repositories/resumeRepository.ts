import { Pool } from 'pg';
import { config } from '@resume-platform/config';
import { ResumeFilters } from '../types';
import {
  buildFindAllResumesQuery,
  buildCountResumesQuery,
  FIND_RESUME_BY_ID,
  COUNT_RESUMES,
  COUNT_RESUMES_BY_STATUS,
} from '../queries/resume.queries';

const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  user: config.database.user,
  password: config.database.password,
  database: config.database.database,
  max: 20,
});

/**
 * Removes server-internal columns before a row leaves the service. `file_path` is the on-disk location
 * of the upload: clients fetch files by id through the upload service and must never learn paths.
 */
export function toPublicResume<T extends Record<string, unknown>>(row: T): Omit<T, 'file_path'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { file_path, ...rest } = row;
  return rest;
}

export class ResumeRepository {
  async findAll(
    filters: ResumeFilters,
    limit: number = 100,
    offset: number = 0,
    sortBy: string = 'created_at',
    sortOrder: 'asc' | 'desc' = 'desc'
  ) {
    const client = await pool.connect();
    try {
      const { text, values } = buildFindAllResumesQuery(filters, limit, offset, sortBy, sortOrder);
      const result = await client.query(text, values);
      return result.rows.map(toPublicResume);
    } finally {
      client.release();
    }
  }

  async countWithFilters(filters: ResumeFilters): Promise<number> {
    const client = await pool.connect();
    try {
      const { text, values } = buildCountResumesQuery(filters);
      const result = await client.query(text, values);
      return parseInt(result.rows[0]?.count || '0', 10);
    } finally {
      client.release();
    }
  }

  async findById(id: string) {
    const client = await pool.connect();
    try {
      const result = await client.query(FIND_RESUME_BY_ID, [id]);
      return result.rows[0] ? toPublicResume(result.rows[0]) : null;
    } finally {
      client.release();
    }
  }

  async count() {
    const client = await pool.connect();
    try {
      const result = await client.query(COUNT_RESUMES);
      return parseInt(result.rows[0].count);
    } finally {
      client.release();
    }
  }

  async countByStatus(status: string) {
    const client = await pool.connect();
    try {
      const result = await client.query(COUNT_RESUMES_BY_STATUS, [status]);
      return parseInt(result.rows[0].count);
    } finally {
      client.release();
    }
  }

  async close() {
    await pool.end();
  }
}

export const resumeRepository = new ResumeRepository();
