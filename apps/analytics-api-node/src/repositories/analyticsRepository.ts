import { Pool, PoolClient } from 'pg';
import { config } from '@resume-platform/config';
import {
  GET_TOP_SKILLS,
  GET_EXPERIENCE_STATS,
  GET_EDUCATION_STATS,
} from '../queries/analytics.queries';
import type { EducationStats, ExperienceStats, SkillCount } from '../types';

/** Postgres returns COUNT(*) and NUMERIC columns as strings. */
interface SkillCountRow {
  skill: string;
  count: string;
}

interface ExperienceStatsRow {
  avg_years: string | null;
  min_years: string | null;
  max_years: string | null;
}

interface EducationStatsRow {
  institution: string;
  count: string;
}

const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  user: config.database.user,
  password: config.database.password,
  database: config.database.database,
  max: 20,
});

export class AnalyticsRepository {
  async getTopSkills(limit: number, client?: Pick<PoolClient, 'query' | 'release'>): Promise<SkillCount[]> {
    const dbClient = client || await pool.connect();
    try {
      const result = await dbClient.query<SkillCountRow>(GET_TOP_SKILLS, [limit]);
      return result.rows.map((row) => ({
        skill: row.skill,
        count: parseInt(row.count),
      }));
    } finally {
      if (!client) dbClient.release();
    }
  }

  async getExperienceStats(): Promise<ExperienceStats> {
    const client = await pool.connect();
    try {
      const result = await client.query<ExperienceStatsRow>(GET_EXPERIENCE_STATS);
      const row = result.rows[0];
      return {
        avg_years: row?.avg_years ? parseFloat(row.avg_years) : 0,
        min_years: row?.min_years ? parseFloat(row.min_years) : 0,
        max_years: row?.max_years ? parseFloat(row.max_years) : 0,
      };
    } finally {
      client.release();
    }
  }

  async getEducationStats(limit: number = 10): Promise<EducationStats[]> {
    const client = await pool.connect();
    try {
      const result = await client.query<EducationStatsRow>(GET_EDUCATION_STATS, [limit]);
      return result.rows.map((row) => ({
        institution: row.institution,
        count: parseInt(row.count),
      }));
    } finally {
      client.release();
    }
  }

  async close() {
    await pool.end();
  }
}

export const analyticsRepository = new AnalyticsRepository();
