import { describe, expect, it, vi } from 'vitest';

vi.mock('../repositories/jobRepository', () => ({
  jobRepository: {
    findAll: vi.fn(),
    findById: vi.fn(),
    findByJobId: vi.fn(),
    create: vi.fn(),
    bulkCreate: vi.fn(),
  },
}));
vi.mock('../repositories/matchRepository', () => ({
  matchRepository: { findByRole: vi.fn() },
}));
vi.mock('../repositories/resumeRepository', () => ({ resumeRepository: {} }));

import { jobService } from './jobService';
import { jobRepository, type JobRole } from '../repositories/jobRepository';
import { matchRepository } from '../repositories/matchRepository';
import { MOCK_JOBS } from '../data/mockJobs';

const jobs = vi.mocked(jobRepository);
const matches = vi.mocked(matchRepository);

const job: JobRole = {
  id: 'job-1',
  title: 'Backend Engineer',
  requiredSkills: ['Node.js', 'PostgreSQL', 'Docker'],
  preferredSkills: [],
  keywords: [],
};

const matchRow = (overrides: Record<string, unknown>) => ({
  resume_id: 'r',
  match_score: '0',
  matched_skills: [],
  missing_skills: [],
  experience_match: false,
  ...overrides,
});

describe('jobService', () => {
  it('delegates lookups to the job repository', async () => {
    jobs.findAll.mockResolvedValue([job]);
    jobs.findById.mockResolvedValue(job);
    jobs.findByJobId.mockResolvedValue(job);

    await expect(jobService.getAllJobs()).resolves.toEqual([job]);
    await expect(jobService.getJobById('job-1')).resolves.toBe(job);
    await expect(jobService.getJobByJobId('JOB-001')).resolves.toBe(job);
    expect(jobs.findByJobId).toHaveBeenCalledWith('JOB-001');
  });

  describe('getJobMatches', () => {
    it('returns null for an unknown job', async () => {
      jobs.findById.mockResolvedValue(null);
      await expect(jobService.getJobMatches('missing')).resolves.toBeNull();
      expect(matches.findByRole).not.toHaveBeenCalled();
    });

    it('aggregates matches for the job', async () => {
      jobs.findById.mockResolvedValue(job);
      matches.findByRole.mockResolvedValue([
        matchRow({
          resume_id: 'r1',
          name: 'Jane',
          match_score: '80.00',
          matched_skills: ['node.js', 'Docker'],
          missing_skills: ['PostgreSQL'],
          experience_match: true,
        }),
        matchRow({ resume_id: 'r2', name: null, file_name: 'bob.pdf', match_score: '60.00', matched_skills: ['Docker'] }),
        matchRow({ resume_id: 'r3', match_score: null, matched_skills: null, missing_skills: null }),
      ]);

      const result = await jobService.getJobMatches('job-1', 50);

      expect(matches.findByRole).toHaveBeenCalledWith('job-1', 50, 1000);
      expect(result).toEqual({
        jobId: 'job-1',
        jobTitle: 'Backend Engineer',
        // average of 80, 60 and 0, scaled by 100
        matchScore: Math.round(((80 + 60 + 0) / 3) * 100),
        skillsMatched: ['node.js', 'Docker'],
        skillsMissing: ['PostgreSQL'],
        experienceMatch: true,
        locationMatch: false,
        // Node.js and Docker covered (case-insensitive), PostgreSQL not, plus experience met
        requirementsMet: 3,
        requirementsTotal: 4,
        matchedResumes: [
          { resumeId: 'r1', resumeName: 'Jane', matchScore: 8000, skillsMatched: ['node.js', 'Docker'] },
          { resumeId: 'r2', resumeName: 'bob.pdf', matchScore: 6000, skillsMatched: ['Docker'] },
          { resumeId: 'r3', resumeName: 'Unknown', matchScore: 0, skillsMatched: [] },
        ],
      });
    });

    it('reports zero scores and only the experience requirement when there are no matches', async () => {
      jobs.findById.mockResolvedValue({ ...job, requiredSkills: undefined as unknown as string[] });
      matches.findByRole.mockResolvedValue([]);

      const result = await jobService.getJobMatches('job-1');

      expect(matches.findByRole).toHaveBeenCalledWith('job-1', 0, 1000);
      expect(result).toMatchObject({
        matchScore: 0,
        experienceMatch: false,
        requirementsMet: 0,
        requirementsTotal: 1,
        matchedResumes: [],
      });
    });

    // Match scores are stored on a 0-100 scale, so multiplying by 100 again yields 0-10000.
    // The frontend's normalizeMatchScore() guesses the scale to compensate. Kept as a characterization
    // test so a fix to the scaling is a deliberate API change.
    it('returns scores multiplied by 100 (0-10000 range)', async () => {
      jobs.findById.mockResolvedValue(job);
      matches.findByRole.mockResolvedValue([matchRow({ match_score: '82.50' })]);

      const result = await jobService.getJobMatches('job-1');
      expect(result?.matchScore).toBe(8250);
    });
  });

  it('getAllJobsWithMatches adds match count and average score to every job', async () => {
    jobs.findAll.mockResolvedValue([job, { ...job, id: 'job-2' }]);
    matches.findByRole
      .mockResolvedValueOnce([matchRow({ match_score: '50' }), matchRow({ match_score: '70' })])
      .mockResolvedValueOnce([]);

    await expect(jobService.getAllJobsWithMatches()).resolves.toEqual([
      { ...job, matchCount: 2, avgMatchScore: 6000 },
      { ...job, id: 'job-2', matchCount: 0, avgMatchScore: 0 },
    ]);
    expect(matches.findByRole).toHaveBeenCalledWith('job-1', 0, 1000);
    expect(matches.findByRole).toHaveBeenCalledWith('job-2', 0, 1000);
  });

  describe('seedJobs', () => {
    it('maps mock jobs to job roles, taking the minimum of the experience range', async () => {
      jobs.bulkCreate.mockImplementation(async (rows) => rows.map((r, i) => ({ ...r, id: `j${i}` })) as JobRole[]);

      await jobService.seedJobs([
        {
          jobId: 'JOB-1',
          title: 'Frontend',
          domain: 'Web',
          experienceRange: '2-4 years',
          location: 'Remote',
          skills: ['React'],
          keywords: ['ui'],
        },
        {
          jobId: 'JOB-2',
          title: 'Intern',
          domain: 'Web',
          experienceRange: 'Fresher',
          location: 'Pune',
          skills: [],
          keywords: [],
        },
      ]);

      expect(jobs.bulkCreate).toHaveBeenCalledWith([
        {
          title: 'Frontend',
          requiredSkills: ['React'],
          preferredSkills: [],
          requiredExperience: 2,
          keywords: ['ui'],
          location: 'Remote',
          description: 'Web position requiring 2-4 years of experience.',
        },
        {
          title: 'Intern',
          requiredSkills: [],
          preferredSkills: [],
          requiredExperience: undefined,
          keywords: [],
          location: 'Pune',
          description: 'Web position requiring Fresher of experience.',
        },
      ]);
    });

    it('treats a "0-N years" range as no experience requirement', async () => {
      jobs.bulkCreate.mockResolvedValue([]);
      await jobService.seedJobs([{ ...MOCK_JOBS[0], experienceRange: '0-2 years' }]);
      expect(jobs.bulkCreate.mock.calls[0][0][0].requiredExperience).toBeUndefined();
    });

    it('accepts the bundled sample jobs', async () => {
      jobs.bulkCreate.mockResolvedValue([]);
      await jobService.seedJobs(MOCK_JOBS);
      const created = jobs.bulkCreate.mock.calls[0][0];
      expect(created).toHaveLength(MOCK_JOBS.length);
      for (const role of created) {
        expect(role.title).toBeTruthy();
        expect(role.requiredSkills.length).toBeGreaterThan(0);
      }
    });
  });

  it('createJob fills in empty arrays for omitted lists', async () => {
    jobs.create.mockResolvedValue({ ...job, id: 'new' });

    await jobService.createJob({ title: 'Data Engineer', requiredExperience: 3 });

    expect(jobs.create).toHaveBeenCalledWith({
      title: 'Data Engineer',
      requiredSkills: [],
      preferredSkills: [],
      requiredExperience: 3,
      keywords: [],
      location: undefined,
      description: undefined,
    });
  });
});
