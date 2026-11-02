import { describe, expect, it, vi } from 'vitest';

const { MockPool, client, pool } = vi.hoisted(() => {
  const client = { query: vi.fn(), release: vi.fn() };
  const pool = { connect: vi.fn(async () => client), end: vi.fn() };
  const MockPool = vi.fn(() => pool);
  return { MockPool, client, pool };
});

vi.mock('pg', () => ({ Pool: MockPool }));

import { config } from '@resume-platform/config';
import type { MatchResult } from '@resume-platform/role-matching';
import { dbService } from './dbService';

// The pool is created once at module load; capture its options before mocks are cleared.
const [poolOptions] = MockPool.mock.calls[0] as unknown as [Record<string, unknown>];

const match = (roleId: string): MatchResult => ({
  roleId,
  roleTitle: 'T',
  matchScore: 75.5,
  matchedSkills: ['go'],
  missingSkills: ['sql'],
  experienceMatch: true,
  details: { skillScore: 80, keywordScore: 50, experienceScore: 70 },
});

describe('matcher dbService', () => {
  it('opens a pool from the database config', () => {
    expect(poolOptions).toMatchObject({
      host: config.database.host,
      port: config.database.port,
      database: config.database.database,
      max: 20,
    });
  });

  it('getResumeWithParsedData selects the parsed fields by id', async () => {
    const row = { id: 'r-1', skills: ['go'] };
    client.query.mockResolvedValueOnce({ rows: [row] });

    await expect(dbService.getResumeWithParsedData('r-1')).resolves.toBe(row);
    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toMatch(/SELECT id, name, email, phone, skills, experience, education, parsed_data\s+FROM resumes WHERE id = \$1/);
    expect(params).toEqual(['r-1']);
    expect(client.release).toHaveBeenCalled();
  });

  it('getResumeWithParsedData returns null when missing', async () => {
    client.query.mockResolvedValueOnce({ rows: [] });
    await expect(dbService.getResumeWithParsedData('nope')).resolves.toBeNull();
  });

  it('getJobRoles maps snake_case columns and null arrays', async () => {
    client.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'j1',
          title: 'Backend',
          required_skills: ['Go'],
          preferred_skills: null,
          required_experience: 3,
          keywords: null,
          location: 'Remote',
          description: 'ignored',
        },
      ],
    });

    await expect(dbService.getJobRoles()).resolves.toEqual([
      {
        id: 'j1',
        title: 'Backend',
        requiredSkills: ['Go'],
        preferredSkills: [],
        requiredExperience: 3,
        keywords: [],
        location: 'Remote',
      },
    ]);
    expect(client.query).toHaveBeenCalledWith('SELECT * FROM job_roles');
  });

  it('saveMatches replaces existing matches for the resume', async () => {
    client.query.mockResolvedValue({ rows: [] });

    await dbService.saveMatches('r-1', [match('j1'), match('j2')]);

    expect(client.query).toHaveBeenNthCalledWith(1, 'DELETE FROM resume_matches WHERE resume_id = $1', ['r-1']);
    expect(client.query).toHaveBeenCalledTimes(3);
    const [sql, params] = client.query.mock.calls[1];
    expect(sql).toContain('INSERT INTO resume_matches');
    expect(params).toEqual(['r-1', 'j1', 75.5, ['go'], ['sql'], true, 80, 50, 70]);
    expect(client.query.mock.calls[2][1][1]).toBe('j2');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('saveMatches with no matches only clears old ones', async () => {
    client.query.mockResolvedValue({ rows: [] });
    await dbService.saveMatches('r-1', []);
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('updateResumeStatus updates by id', async () => {
    client.query.mockResolvedValueOnce({ rows: [] });
    await dbService.updateResumeStatus('r-1', 'matched');
    expect(client.query).toHaveBeenCalledWith('UPDATE resumes SET status = $1, updated_at = NOW() WHERE id = $2', [
      'matched',
      'r-1',
    ]);
  });

  it('releases the client when a query fails', async () => {
    client.query.mockRejectedValueOnce(new Error('db down'));
    await expect(dbService.getJobRoles()).rejects.toThrow('db down');
    expect(client.release).toHaveBeenCalled();
  });

  it('close ends the pool', async () => {
    await dbService.close();
    expect(pool.end).toHaveBeenCalled();
  });
});
