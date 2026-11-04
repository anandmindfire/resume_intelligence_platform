import { beforeEach, describe, expect, it, vi } from 'vitest';

const { MockPool, client, pool } = vi.hoisted(() => {
  const client = { query: vi.fn(), release: vi.fn() };
  const pool = { connect: vi.fn(async () => client), end: vi.fn() };
  const MockPool = vi.fn(() => pool);
  return { MockPool, client, pool };
});

vi.mock('pg', () => ({ Pool: MockPool }));

import { config } from '@resume-platform/config';
import { analyticsRepository, AnalyticsRepository } from './analyticsRepository';
import { jobRepository } from './jobRepository';
import { matchRepository, MatchRepository } from './matchRepository';
import { resumeRepository, ResumeRepository } from './resumeRepository';
import * as repositoriesIndex from './index';
import {
  COUNT_RESUMES,
  COUNT_RESUMES_BY_STATUS,
  FIND_ALL_JOBS,
  FIND_JOB_BY_ID,
  FIND_JOB_BY_TITLE,
  FIND_RESUME_BY_ID,
  GET_EDUCATION_STATS,
  GET_EXPERIENCE_STATS,
  GET_ROLES_WITH_MATCHES,
  GET_SUMMARY_BY_ROLE,
  GET_TOP_SKILLS,
  INSERT_JOB,
  SELECT_JOB_ID_BY_TITLE,
} from '../queries';

// Each repository creates its own pool at module load; capture the options before mocks are cleared.
const poolConstructorCalls = [...MockPool.mock.calls];

const rows = (...r: unknown[]) => ({ rows: r });

describe('repository pools', () => {
  it('each repository opens a pool from the database config', () => {
    expect(poolConstructorCalls).toHaveLength(4);
    for (const [options] of poolConstructorCalls as unknown as Array<[Record<string, unknown>]>) {
      expect(options).toEqual({
        host: config.database.host,
        port: config.database.port,
        user: config.database.user,
        password: config.database.password,
        database: config.database.database,
        max: 20,
      });
    }
  });

  it('re-exports the repositories from the index', () => {
    expect(repositoriesIndex.resumeRepository).toBe(resumeRepository);
    expect(repositoriesIndex.matchRepository).toBe(matchRepository);
    expect(repositoriesIndex.analyticsRepository).toBe(analyticsRepository);
    expect(repositoriesIndex.ResumeRepository).toBe(ResumeRepository);
    expect(repositoriesIndex.MatchRepository).toBe(MatchRepository);
    expect(repositoriesIndex.AnalyticsRepository).toBe(AnalyticsRepository);
  });
});

describe('AnalyticsRepository', () => {
  it('getTopSkills parses counts to integers', async () => {
    client.query.mockResolvedValueOnce(
      rows({ skill: 'python', count: '12' }, { skill: 'sql', count: '7' })
    );

    await expect(analyticsRepository.getTopSkills(5)).resolves.toEqual([
      { skill: 'python', count: 12 },
      { skill: 'sql', count: 7 },
    ]);
    expect(client.query).toHaveBeenCalledWith(GET_TOP_SKILLS, [5]);
    expect(client.release).toHaveBeenCalled();
  });

  it('getTopSkills uses a provided client without releasing it', async () => {
    const external = { query: vi.fn().mockResolvedValue(rows()), release: vi.fn() };

    await analyticsRepository.getTopSkills(5, external);

    expect(external.query).toHaveBeenCalledWith(GET_TOP_SKILLS, [5]);
    expect(external.release).not.toHaveBeenCalled();
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('getExperienceStats parses numeric strings', async () => {
    client.query.mockResolvedValueOnce(
      rows({ avg_years: '4.25', min_years: '0.5', max_years: '12' })
    );

    await expect(analyticsRepository.getExperienceStats()).resolves.toEqual({
      avg_years: 4.25,
      min_years: 0.5,
      max_years: 12,
    });
    expect(client.query).toHaveBeenCalledWith(GET_EXPERIENCE_STATS);
  });

  it('getExperienceStats returns zeros when there is no data', async () => {
    client.query.mockResolvedValueOnce(rows({ avg_years: null, min_years: null, max_years: null }));
    await expect(analyticsRepository.getExperienceStats()).resolves.toEqual({
      avg_years: 0,
      min_years: 0,
      max_years: 0,
    });

    client.query.mockResolvedValueOnce(rows());
    await expect(analyticsRepository.getExperienceStats()).resolves.toEqual({
      avg_years: 0,
      min_years: 0,
      max_years: 0,
    });
  });

  it('getEducationStats parses counts and defaults the limit to 10', async () => {
    client.query.mockResolvedValueOnce(rows({ institution: 'MIT', count: '3' }));

    await expect(analyticsRepository.getEducationStats()).resolves.toEqual([
      { institution: 'MIT', count: 3 },
    ]);
    expect(client.query).toHaveBeenCalledWith(GET_EDUCATION_STATS, [10]);
  });

  it('releases the client when a query fails', async () => {
    client.query.mockRejectedValueOnce(new Error('db down'));
    await expect(analyticsRepository.getEducationStats(5)).rejects.toThrow('db down');
    expect(client.release).toHaveBeenCalled();
  });
});

describe('JobRepository', () => {
  const dbJob = {
    id: 'job-1',
    title: 'Backend Engineer',
    requiredSkills: ['Node.js'],
    preferredSkills: null,
    requiredExperience: 3,
    keywords: null,
    location: 'Remote',
    description: null,
  };
  const mappedJob = { ...dbJob, preferredSkills: [], keywords: [] };

  it('findAll maps null arrays to empty arrays', async () => {
    client.query.mockResolvedValueOnce(rows(dbJob));

    await expect(jobRepository.findAll()).resolves.toEqual([mappedJob]);
    expect(client.query).toHaveBeenCalledWith(FIND_ALL_JOBS);
  });

  it('findById returns the job or null', async () => {
    client.query.mockResolvedValueOnce(rows(dbJob));
    await expect(jobRepository.findById('job-1')).resolves.toEqual(mappedJob);
    expect(client.query).toHaveBeenCalledWith(FIND_JOB_BY_ID, ['job-1']);

    client.query.mockResolvedValueOnce(rows());
    await expect(jobRepository.findById('missing')).resolves.toBeNull();
  });

  it('findByJobId searches titles with a wildcard', async () => {
    client.query.mockResolvedValueOnce(rows(dbJob));
    await expect(jobRepository.findByJobId('Backend')).resolves.toEqual(mappedJob);
    expect(client.query).toHaveBeenCalledWith(FIND_JOB_BY_TITLE, ['%Backend%']);

    client.query.mockResolvedValueOnce(rows());
    await expect(jobRepository.findByJobId('nope')).resolves.toBeNull();
  });

  it('create inserts with nulls for missing optional fields', async () => {
    client.query.mockResolvedValueOnce(rows(dbJob));

    await jobRepository.create({
      title: 'Backend Engineer',
      requiredSkills: ['Node.js'],
      preferredSkills: [],
      keywords: [],
    });

    expect(client.query).toHaveBeenCalledWith(INSERT_JOB, [
      'Backend Engineer',
      ['Node.js'],
      [],
      null,
      [],
      null,
      null,
    ]);
  });

  it('create passes every provided field', async () => {
    client.query.mockResolvedValueOnce(rows(dbJob));

    await jobRepository.create({
      title: 'T',
      requiredSkills: ['a'],
      preferredSkills: ['b'],
      requiredExperience: 0,
      keywords: ['k'],
      location: 'L',
      description: 'D',
    });

    expect(client.query).toHaveBeenCalledWith(INSERT_JOB, ['T', ['a'], ['b'], 0, ['k'], 'L', 'D']);
  });

  it('bulkCreate inserts new titles and returns existing ones unchanged', async () => {
    client.query
      .mockResolvedValueOnce(rows()) // "New" does not exist
      .mockResolvedValueOnce(rows({ ...dbJob, id: 'new', title: 'New' })) // insert
      .mockResolvedValueOnce(rows({ id: 'existing' })) // "Existing" exists
      .mockResolvedValueOnce(rows({ ...dbJob, id: 'existing', title: 'Existing' })); // fetch full row

    const result = await jobRepository.bulkCreate([
      { title: 'New', requiredSkills: [], preferredSkills: [], keywords: [] },
      { title: 'Existing', requiredSkills: [], preferredSkills: [], keywords: [] },
    ]);

    expect(result.map((j) => j.id)).toEqual(['new', 'existing']);
    expect(client.query).toHaveBeenNthCalledWith(1, SELECT_JOB_ID_BY_TITLE, ['New']);
    expect(client.query).toHaveBeenNthCalledWith(2, INSERT_JOB, expect.any(Array));
    expect(client.query).toHaveBeenNthCalledWith(3, SELECT_JOB_ID_BY_TITLE, ['Existing']);
    expect(client.query).toHaveBeenNthCalledWith(4, FIND_JOB_BY_ID, ['existing']);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('bulkCreate skips an existing title whose row disappears', async () => {
    client.query.mockResolvedValueOnce(rows({ id: 'gone' })).mockResolvedValueOnce(rows());

    const result = await jobRepository.bulkCreate([
      { title: 'Gone', requiredSkills: [], preferredSkills: [], keywords: [] },
    ]);
    expect(result).toEqual([]);
  });

  it('close ends the pool', async () => {
    await jobRepository.close();
    expect(pool.end).toHaveBeenCalled();
  });
});

describe('MatchRepository', () => {
  it('findByRole without a role passes minScore, limit, offset', async () => {
    client.query.mockResolvedValueOnce(rows({ id: 'm1' }));

    await expect(matchRepository.findByRole(undefined, 50, 10, 20)).resolves.toEqual([
      { id: 'm1' },
    ]);
    const [sql, params] = client.query.mock.calls[0];
    expect(sql).not.toContain('rm.role_id = $2');
    expect(params).toEqual([50, 10, 20]);
  });

  it('findByRole with a role inserts the role id as the second parameter', async () => {
    client.query.mockResolvedValueOnce(rows());

    await matchRepository.findByRole('role-1');
    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toContain('rm.role_id = $2');
    expect(params).toEqual([0, 'role-1', 100, 0]);
  });

  it('countByRole parses the count and defaults to 0', async () => {
    client.query.mockResolvedValueOnce(rows({ count: '17' }));
    await expect(matchRepository.countByRole('role-1', 30)).resolves.toBe(17);
    expect(client.query.mock.calls[0][1]).toEqual([30, 'role-1']);

    client.query.mockResolvedValueOnce(rows());
    await expect(matchRepository.countByRole()).resolves.toBe(0);
    expect(client.query.mock.calls[1][1]).toEqual([0]);
  });

  it('getRolesWithMatches filters by minimum score', async () => {
    client.query.mockResolvedValueOnce(rows({ id: 'r', title: 'T' }));
    await expect(matchRepository.getRolesWithMatches(40)).resolves.toEqual([
      { id: 'r', title: 'T' },
    ]);
    expect(client.query).toHaveBeenCalledWith(GET_ROLES_WITH_MATCHES, [40]);
  });

  it('getSummaryByRole returns raw rows', async () => {
    const summary = { role_title: 'T', match_count: '3', avg_score: '55.5' };
    client.query.mockResolvedValueOnce(rows(summary));
    await expect(matchRepository.getSummaryByRole()).resolves.toEqual([summary]);
    expect(client.query).toHaveBeenCalledWith(GET_SUMMARY_BY_ROLE);
  });
});

describe('ResumeRepository', () => {
  beforeEach(() => {
    client.query.mockResolvedValue(rows());
  });

  it('findAll builds the filtered query with paging and sort', async () => {
    client.query.mockResolvedValueOnce(rows({ id: 'r1' }));

    await expect(
      resumeRepository.findAll({ keyword: 'jane' }, 5, 10, 'name', 'asc')
    ).resolves.toEqual([{ id: 'r1' }]);
    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toContain('ORDER BY name asc');
    expect(params).toEqual(['%jane%', 5, 10]);
  });

  it('findAll defaults to 100 newest resumes', async () => {
    await resumeRepository.findAll({});
    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toContain('ORDER BY created_at desc');
    expect(params).toEqual([100, 0]);
  });

  it('countWithFilters parses the count and defaults to 0', async () => {
    client.query.mockResolvedValueOnce(rows({ count: '9' }));
    await expect(resumeRepository.countWithFilters({ location: 'Pune' })).resolves.toBe(9);
    expect(client.query.mock.calls[0][1]).toEqual(['%Pune%']);

    await expect(resumeRepository.countWithFilters({})).resolves.toBe(0);
  });

  it('findById returns the row or null', async () => {
    client.query.mockResolvedValueOnce(rows({ id: 'r1' }));
    await expect(resumeRepository.findById('r1')).resolves.toEqual({ id: 'r1' });
    expect(client.query).toHaveBeenCalledWith(FIND_RESUME_BY_ID, ['r1']);

    await expect(resumeRepository.findById('missing')).resolves.toBeNull();
  });

  it('never returns the server-side file path to clients', async () => {
    client.query.mockResolvedValueOnce(
      rows({ id: 'r1', file_path: '/app/uploads/x.pdf', file_name: 'x.pdf' })
    );
    await expect(resumeRepository.findById('r1')).resolves.toEqual({
      id: 'r1',
      file_name: 'x.pdf',
    });

    client.query.mockResolvedValueOnce(rows({ id: 'r2', file_path: '/app/uploads/y.pdf' }));
    await expect(resumeRepository.findAll({})).resolves.toEqual([{ id: 'r2' }]);
  });

  it('count and countByStatus parse counts', async () => {
    client.query
      .mockResolvedValueOnce(rows({ count: '120' }))
      .mockResolvedValueOnce(rows({ count: '97' }));

    await expect(resumeRepository.count()).resolves.toBe(120);
    await expect(resumeRepository.countByStatus('matched')).resolves.toBe(97);
    expect(client.query).toHaveBeenNthCalledWith(1, COUNT_RESUMES);
    expect(client.query).toHaveBeenNthCalledWith(2, COUNT_RESUMES_BY_STATUS, ['matched']);
  });

  it('releases the client on every call, including failures', async () => {
    client.query.mockRejectedValueOnce(new Error('db down'));
    await expect(resumeRepository.count()).rejects.toThrow('db down');
    await resumeRepository.findById('x');
    expect(client.release).toHaveBeenCalledTimes(2);
  });

  it('close ends the pools', async () => {
    await Promise.all([
      resumeRepository.close(),
      matchRepository.close(),
      analyticsRepository.close(),
    ]);
    expect(pool.end).toHaveBeenCalledTimes(3);
  });
});
