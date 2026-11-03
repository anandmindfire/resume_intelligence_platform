import { Pool } from 'pg';
import { config } from '@resume-platform/config';
import { ResumeExportRecord } from '../types';
import { DB_POOL } from '../constants';

/** A resumes row as selected by the export queries; parsed columns are nullable in Postgres. */
interface ResumeExportRow {
  id: string;
  file_name: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  skills: string[] | null;
  experience: unknown[] | null;
  education: unknown[] | null;
  status: string | null;
  created_at: string | null;
}
import { GET_RESUMES_FOR_EXPORT_ALL, GET_RESUMES_BY_IDS } from '../queries';

const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  user: config.database.user,
  password: config.database.password,
  database: config.database.database,
  max: DB_POOL.MAX,
});

class DbService {
  async getResumesForExport(resumeIds?: string[]): Promise<ResumeExportRecord[]> {
    const client = await pool.connect();
    try {
      const query =
        resumeIds && resumeIds.length > 0 ? GET_RESUMES_BY_IDS : GET_RESUMES_FOR_EXPORT_ALL;
      const params = resumeIds && resumeIds.length > 0 ? [resumeIds] : [];
      const result = await client.query<ResumeExportRow>(query, params);

      return result.rows.map((resume) => ({
        id: resume.id,
        file_name: resume.file_name || '',
        name: resume.name || '',
        email: resume.email || '',
        phone: resume.phone || '',
        skills: Array.isArray(resume.skills) ? resume.skills.join('; ') : '',
        experience_count: Array.isArray(resume.experience) ? resume.experience.length : 0,
        education_count: Array.isArray(resume.education) ? resume.education.length : 0,
        status: resume.status || '',
        created_at: resume.created_at || '',
      }));
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
