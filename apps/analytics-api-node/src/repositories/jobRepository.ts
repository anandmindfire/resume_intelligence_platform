import { Pool } from 'pg';
import { config } from '@resume-platform/config';
import {
  FIND_ALL_JOBS,
  FIND_JOB_BY_ID,
  FIND_JOB_BY_TITLE,
  SELECT_JOB_ID_BY_TITLE,
  INSERT_JOB,
} from '../queries/job.queries';

const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  user: config.database.user,
  password: config.database.password,
  database: config.database.database,
  max: 20,
});

export interface JobRole {
  id: string;
  jobId?: string;
  title: string;
  domain?: string;
  experienceRange?: string;
  requiredSkills: string[];
  preferredSkills: string[];
  requiredExperience?: number;
  keywords: string[];
  location?: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

/** A job_roles row as selected by the job queries: array columns are nullable in Postgres. */
type JobRow = Omit<JobRole, 'requiredSkills' | 'preferredSkills' | 'keywords'> & {
  requiredSkills: string[] | null;
  preferredSkills: string[] | null;
  keywords: string[] | null;
};

function mapJobRow(row: JobRow): JobRole {
  return {
    ...row,
    requiredSkills: row.requiredSkills || [],
    preferredSkills: row.preferredSkills || [],
    keywords: row.keywords || [],
  };
}

export class JobRepository {
  async findAll(): Promise<JobRole[]> {
    const client = await pool.connect();
    try {
      const result = await client.query<JobRow>(FIND_ALL_JOBS);
      return result.rows.map(mapJobRow);
    } finally {
      client.release();
    }
  }

  async findById(id: string): Promise<JobRole | null> {
    const client = await pool.connect();
    try {
      const result = await client.query<JobRow>(FIND_JOB_BY_ID, [id]);
      if (result.rows.length === 0) return null;
      return mapJobRow(result.rows[0]);
    } finally {
      client.release();
    }
  }

  async findByJobId(jobId: string): Promise<JobRole | null> {
    const client = await pool.connect();
    try {
      const result = await client.query<JobRow>(FIND_JOB_BY_TITLE, [`%${jobId}%`]);
      if (result.rows.length === 0) return null;
      return mapJobRow(result.rows[0]);
    } finally {
      client.release();
    }
  }

  async create(job: Omit<JobRole, 'id' | 'created_at' | 'updated_at'>): Promise<JobRole> {
    const client = await pool.connect();
    try {
      const result = await client.query<JobRow>(INSERT_JOB, [
        job.title,
        job.requiredSkills || [],
        job.preferredSkills || [],
        job.requiredExperience ?? null,
        job.keywords || [],
        job.location ?? null,
        job.description ?? null,
      ]);
      return mapJobRow(result.rows[0]);
    } finally {
      client.release();
    }
  }

  async bulkCreate(jobs: Omit<JobRole, 'id' | 'created_at' | 'updated_at'>[]): Promise<JobRole[]> {
    const client = await pool.connect();
    try {
      const createdJobs: JobRole[] = [];
      for (const job of jobs) {
        const existing = await client.query(SELECT_JOB_ID_BY_TITLE, [job.title]);
        if (existing.rows.length === 0) {
          const result = await client.query<JobRow>(INSERT_JOB, [
            job.title,
            job.requiredSkills || [],
            job.preferredSkills || [],
            job.requiredExperience ?? null,
            job.keywords || [],
            job.location ?? null,
            job.description ?? null,
          ]);
          createdJobs.push(mapJobRow(result.rows[0]));
        } else {
          const fullJob = await client.query<JobRow>(FIND_JOB_BY_ID, [existing.rows[0].id]);
          if (fullJob.rows.length > 0) {
            createdJobs.push(mapJobRow(fullJob.rows[0]));
          }
        }
      }
      return createdJobs;
    } finally {
      client.release();
    }
  }

  async close() {
    await pool.end();
  }
}

export const jobRepository = new JobRepository();
