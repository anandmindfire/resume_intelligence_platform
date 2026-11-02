import { Pool } from 'pg';
import { config } from '@resume-platform/config';
import { MatchResult, JobRole } from '@resume-platform/role-matching';
import type { ResumeWithParsedData } from '../types';

/** A job_roles row; array and numeric columns are nullable in Postgres. */
interface JobRoleRow {
  id: string;
  title: string;
  required_skills: string[] | null;
  preferred_skills: string[] | null;
  required_experience: number | null;
  keywords: string[] | null;
  location: string | null;
}

const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  user: config.database.user,
  password: config.database.password,
  database: config.database.database,
  max: 20,
});

class DbService {
  async getResumeWithParsedData(resumeId: string): Promise<ResumeWithParsedData | null> {
    const client = await pool.connect();
    try {
      const result = await client.query<ResumeWithParsedData>(
        `SELECT id, name, email, phone, skills, experience, education, parsed_data 
         FROM resumes WHERE id = $1`,
        [resumeId]
      );
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  async getJobRoles(): Promise<JobRole[]> {
    const client = await pool.connect();
    try {
      const result = await client.query<JobRoleRow>('SELECT * FROM job_roles');
      return result.rows.map((row) => ({
        id: row.id,
        title: row.title,
        requiredSkills: row.required_skills || [],
        preferredSkills: row.preferred_skills || [],
        requiredExperience: row.required_experience ?? undefined,
        keywords: row.keywords || [],
        location: row.location ?? undefined,
      }));
    } finally {
      client.release();
    }
  }

  async saveMatches(resumeId: string, matches: MatchResult[]): Promise<void> {
    const client = await pool.connect();
    try {
      // Delete existing matches
      await client.query('DELETE FROM resume_matches WHERE resume_id = $1', [resumeId]);

      // Insert new matches
      for (const match of matches) {
        await client.query(
          `INSERT INTO resume_matches 
           (resume_id, role_id, match_score, matched_skills, missing_skills, 
            experience_match, skill_score, keyword_score, experience_score, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
          [
            resumeId,
            match.roleId,
            match.matchScore,
            match.matchedSkills,
            match.missingSkills,
            match.experienceMatch,
            match.details.skillScore,
            match.details.keywordScore,
            match.details.experienceScore,
          ]
        );
      }
    } finally {
      client.release();
    }
  }

  async updateResumeStatus(resumeId: string, status: string): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query(
        'UPDATE resumes SET status = $1, updated_at = NOW() WHERE id = $2',
        [status, resumeId]
      );
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
