import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('./services/analyticsService', () => ({
  analyticsService: {
    getDashboardSummary: vi.fn(),
    getTopSkills: vi.fn(),
    getExperienceStats: vi.fn(),
    getEducationStats: vi.fn(),
    getRoleMatches: vi.fn(),
    getResumes: vi.fn(),
    getResume: vi.fn(),
    exportResumesToCSV: vi.fn(),
  },
}));

vi.mock('./services/jobService', () => ({
  jobService: {
    getAllJobs: vi.fn(),
    getAllJobsWithMatches: vi.fn(),
    getJobById: vi.fn(),
    getJobMatches: vi.fn(),
    seedJobs: vi.fn(),
    createJob: vi.fn(),
  },
}));

vi.mock('@resume-platform/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { config } from '@resume-platform/config';
import { buildApp } from './app';
import { analyticsService } from './services/analyticsService';
import { jobService } from './services/jobService';
import { MOCK_JOBS } from './data/mockJobs';

const analytics = vi.mocked(analyticsService);
const jobs = vi.mocked(jobService);

describe('analytics-api app', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const get = (url: string) => app.inject({ method: 'GET', url });

  it('GET /health reports ok', async () => {
    const res = await get('/health');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', service: 'analytics-api' });
  });

  describe('analytics routes', () => {
    it('GET /api/v1/dashboard returns the summary unchanged', async () => {
      const summary = {
        totalResumes: 2,
        processedResumes: 1,
        topSkills: [],
        roleMatches: [{ role_title: 'T', match_count: '1', avg_score: '55.50' }],
      };
      analytics.getDashboardSummary.mockResolvedValueOnce(summary);

      const res = await get('/api/v1/dashboard');
      expect(res.statusCode).toBe(200);
      // NUMERIC/COUNT strings from Postgres must not be coerced by the documented response schema.
      expect(res.json()).toEqual(summary);
    });

    it('GET /api/v1/skills/top validates the limit', async () => {
      analytics.getTopSkills.mockResolvedValue([{ skill: 'python', count: 3 }]);

      expect((await get('/api/v1/skills/top')).json()).toEqual([{ skill: 'python', count: 3 }]);
      expect(analytics.getTopSkills).toHaveBeenLastCalledWith(10);

      await get('/api/v1/skills/top?limit=500');
      expect(analytics.getTopSkills).toHaveBeenLastCalledWith(100);

      // Schemas are documentation only: invalid input still falls back to defaults instead of 400.
      const res = await get('/api/v1/skills/top?limit=abc');
      expect(res.statusCode).toBe(200);
      expect(analytics.getTopSkills).toHaveBeenLastCalledWith(10);
    });

    it('GET /api/v1/experience/stats and /education/stats return service data', async () => {
      analytics.getExperienceStats.mockResolvedValueOnce({ avg_years: 3, min_years: 1, max_years: 5 });
      analytics.getEducationStats.mockResolvedValueOnce([{ institution: 'MIT', count: 2 }]);

      expect((await get('/api/v1/experience/stats')).json()).toEqual({ avg_years: 3, min_years: 1, max_years: 5 });
      expect((await get('/api/v1/education/stats')).json()).toEqual([{ institution: 'MIT', count: 2 }]);
    });

    it('GET /api/v1/matches parses filters and pagination', async () => {
      analytics.getRoleMatches.mockResolvedValueOnce({ data: [], total: 0, page: 2, limit: 5, totalPages: 1, uniqueRoles: [] });

      const res = await get('/api/v1/matches?roleId=role-1&minScore=70&page=2&limit=5');

      expect(res.statusCode).toBe(200);
      expect(analytics.getRoleMatches).toHaveBeenCalledWith('role-1', 70, { page: 2, limit: 5 });
    });

    it('GET /api/v1/matches applies defaults', async () => {
      analytics.getRoleMatches.mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 10, totalPages: 1, uniqueRoles: [] });
      await get('/api/v1/matches');
      expect(analytics.getRoleMatches).toHaveBeenCalledWith(undefined, 0, { page: 1, limit: 10 });
    });

    it('GET /api/v1/resumes sanitizes filters and passes sorting', async () => {
      analytics.getResumes.mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 20, totalPages: 1 });

      await get('/api/v1/resumes?keyword=%20jane%20&location=Pune&minScore=50&roleId=r&page=1&limit=20&sortBy=name&sortOrder=ASC');

      expect(analytics.getResumes).toHaveBeenCalledWith(
        { keyword: 'jane', location: 'Pune', minScore: 50, roleId: 'r' },
        { page: 1, limit: 20, sortBy: 'name', sortOrder: 'asc' }
      );
    });

    it('GET /api/v1/resumes defaults sorting to newest first', async () => {
      analytics.getResumes.mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 10, totalPages: 1 });
      await get('/api/v1/resumes');
      expect(analytics.getResumes).toHaveBeenCalledWith(
        { keyword: undefined, location: undefined, minScore: 0, roleId: undefined },
        { page: 1, limit: 10, sortBy: 'created_at', sortOrder: 'desc' }
      );
    });

    it('GET /api/v1/resumes/:id returns the resume or 404', async () => {
      analytics.getResume.mockResolvedValueOnce({ id: 'r1', file_size: '1024' });
      const found = await get('/api/v1/resumes/r1');
      expect(found.statusCode).toBe(200);
      expect(found.json()).toEqual({ id: 'r1', file_size: '1024' });

      analytics.getResume.mockResolvedValueOnce(null);
      const missing = await get('/api/v1/resumes/nope');
      expect(missing.statusCode).toBe(404);
      expect(missing.json()).toEqual({ error: 'Resume not found' });
    });

    it('POST /api/v1/export/csv passes the requested ids', async () => {
      analytics.exportResumesToCSV.mockResolvedValue([{ id: 'a' }]);

      const res = await app.inject({ method: 'POST', url: '/api/v1/export/csv', payload: { resumeIds: ['a'] } });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([{ id: 'a' }]);
      expect(analytics.exportResumesToCSV).toHaveBeenLastCalledWith(['a']);

      await app.inject({ method: 'POST', url: '/api/v1/export/csv', payload: {} });
      expect(analytics.exportResumesToCSV).toHaveBeenLastCalledWith(undefined);
    });

    it.each([
      ['/api/v1/dashboard', () => analytics.getDashboardSummary],
      ['/api/v1/skills/top', () => analytics.getTopSkills],
      ['/api/v1/experience/stats', () => analytics.getExperienceStats],
      ['/api/v1/education/stats', () => analytics.getEducationStats],
      ['/api/v1/matches', () => analytics.getRoleMatches],
      ['/api/v1/resumes', () => analytics.getResumes],
      ['/api/v1/resumes/r1', () => analytics.getResume],
    ])('GET %s returns 500 with the error message when the service fails', async (url, method) => {
      method().mockRejectedValueOnce(new Error('db down'));
      const res = await get(url);
      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: 'db down' });
    });

    it('POST /api/v1/export/csv returns 500 when the service fails', async () => {
      analytics.exportResumesToCSV.mockRejectedValueOnce(new Error('db down'));
      const res = await app.inject({ method: 'POST', url: '/api/v1/export/csv', payload: {} });
      expect(res.statusCode).toBe(500);
    });
  });

  describe('job routes', () => {
    const job = { id: 'job-1', title: 'Backend', requiredSkills: [], preferredSkills: [], keywords: [] };

    it('GET /api/v1/jobs lists jobs', async () => {
      jobs.getAllJobs.mockResolvedValueOnce([job]);
      expect((await get('/api/v1/jobs')).json()).toEqual([job]);
    });

    it('GET /api/v1/jobs/with-matches is not captured by the :id route', async () => {
      jobs.getAllJobsWithMatches.mockResolvedValueOnce([{ ...job, matchCount: 1, avgMatchScore: 50 }]);

      const res = await get('/api/v1/jobs/with-matches');
      expect(res.json()).toEqual([{ ...job, matchCount: 1, avgMatchScore: 50 }]);
      expect(jobs.getJobById).not.toHaveBeenCalled();
    });

    it('GET /api/v1/jobs/:id returns the job or 404', async () => {
      jobs.getJobById.mockResolvedValueOnce(job);
      expect((await get('/api/v1/jobs/job-1')).json()).toEqual(job);
      expect(jobs.getJobById).toHaveBeenCalledWith('job-1');

      jobs.getJobById.mockResolvedValueOnce(null);
      const missing = await get('/api/v1/jobs/nope');
      expect(missing.statusCode).toBe(404);
      expect(missing.json()).toEqual({ error: 'Job not found' });
    });

    it('GET /api/v1/jobs/:id/matches parses minScore and returns 404 for unknown jobs', async () => {
      jobs.getJobMatches.mockResolvedValueOnce({ jobId: 'job-1' } as never);
      const res = await get('/api/v1/jobs/job-1/matches?minScore=42.5');
      expect(res.statusCode).toBe(200);
      expect(jobs.getJobMatches).toHaveBeenCalledWith('job-1', 42.5);

      jobs.getJobMatches.mockResolvedValueOnce(null);
      const missing = await get('/api/v1/jobs/nope/matches');
      expect(missing.statusCode).toBe(404);
      expect(jobs.getJobMatches).toHaveBeenLastCalledWith('nope', 0);
    });

    it('POST /api/v1/jobs/seed seeds the bundled sample jobs', async () => {
      jobs.seedJobs.mockResolvedValueOnce([job, job]);

      const res = await app.inject({ method: 'POST', url: '/api/v1/jobs/seed' });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ message: 'Jobs seeded successfully', count: 2, jobs: [job, job] });
      expect(jobs.seedJobs).toHaveBeenCalledWith(MOCK_JOBS);
    });

    it('POST /api/v1/jobs creates a job with 201', async () => {
      jobs.createJob.mockResolvedValueOnce(job);
      const body = { title: 'Backend', requiredSkills: ['Go'] };

      const res = await app.inject({ method: 'POST', url: '/api/v1/jobs', payload: body });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual(job);
      expect(jobs.createJob).toHaveBeenCalledWith(body);
    });

    it.each([
      ['GET', '/api/v1/jobs', () => jobs.getAllJobs],
      ['GET', '/api/v1/jobs/with-matches', () => jobs.getAllJobsWithMatches],
      ['GET', '/api/v1/jobs/job-1', () => jobs.getJobById],
      ['GET', '/api/v1/jobs/job-1/matches', () => jobs.getJobMatches],
      ['POST', '/api/v1/jobs/seed', () => jobs.seedJobs],
      ['POST', '/api/v1/jobs', () => jobs.createJob],
    ] as const)('%s %s returns 500 when the service fails', async (method, url, fn) => {
      fn().mockRejectedValueOnce(new Error('db down'));
      const res = await app.inject({ method, url, ...(method === 'POST' ? { payload: { title: 'x' } } : {}) });
      expect(res.statusCode).toBe(500);
      expect(res.json()).toEqual({ error: 'db down' });
    });
  });

  describe('API docs', () => {
    it('documents every route in an OpenAPI 3 spec', async () => {
      const spec = (await get('/docs/json')).json();

      expect(spec.openapi).toBe('3.0.3');
      expect(spec.info.title).toBe('Analytics API');
      expect(Object.keys(spec.paths).sort()).toEqual([
        '/api/v1/dashboard',
        '/api/v1/education/stats',
        '/api/v1/experience/stats',
        '/api/v1/export/csv',
        '/api/v1/jobs',
        '/api/v1/jobs/seed',
        '/api/v1/jobs/with-matches',
        '/api/v1/jobs/{id}',
        '/api/v1/jobs/{id}/matches',
        '/api/v1/matches',
        '/api/v1/resumes',
        '/api/v1/resumes/{id}',
        '/api/v1/skills/top',
        '/health',
      ]);
    });

    it('publishes shared models under their own names', async () => {
      const spec = (await get('/docs/json')).json();

      expect(Object.keys(spec.components.schemas)).toEqual(
        expect.arrayContaining(['ErrorResponse', 'Resume', 'ResumeMatch', 'JobRole', 'SkillCount'])
      );
      const ok = spec.paths['/api/v1/resumes/{id}'].get.responses['200'];
      expect(ok.description).toBe('The resume');
      expect(ok.content['application/json'].schema).toMatchObject({ $ref: '#/components/schemas/Resume' });
    });

    it('documents query parameters for resume search', async () => {
      const spec = (await get('/docs/json')).json();
      const names = spec.paths['/api/v1/resumes'].get.parameters.map((p: { name: string }) => p.name);
      expect(names).toEqual(['keyword', 'location', 'roleId', 'minScore', 'page', 'limit', 'sortBy', 'sortOrder']);
    });

    it('serves Swagger UI', async () => {
      const res = await get('/docs');
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
    });

    it('is not registered when API docs are disabled', async () => {
      const original = config.apiDocs.enabled;
      config.apiDocs.enabled = false;
      const noDocs = await buildApp();
      try {
        expect((await noDocs.inject({ url: '/docs/json' })).statusCode).toBe(404);
        // Routes referencing shared models still register without the swagger plugin.
        analytics.getResume.mockResolvedValueOnce({ id: 'r1' });
        expect((await noDocs.inject({ url: '/api/v1/resumes/r1' })).statusCode).toBe(200);
      } finally {
        config.apiDocs.enabled = original;
        await noDocs.close();
      }
    });
  });
});
