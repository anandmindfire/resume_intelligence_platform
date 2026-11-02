import { describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import type { QueueJobData } from '@resume-platform/queue-lib';

vi.mock('../services/dbService', () => ({
  dbService: {
    getResumeWithParsedData: vi.fn(),
    getJobRoles: vi.fn(),
    saveMatches: vi.fn(),
    updateResumeStatus: vi.fn(),
  },
}));
vi.mock('../queues/queueHandler', () => ({
  queueHandler: { triggerInsightsAggregation: vi.fn() },
}));
vi.mock('@resume-platform/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }));

import { RoleMatcher, type JobRole } from '@resume-platform/role-matching';
import { processMatchJob } from './matchProcessor';
import { dbService } from '../services/dbService';
import { queueHandler } from '../queues/queueHandler';

const db = vi.mocked(dbService);

const job = { data: { resumeId: 'r-1', filePath: '', fileName: '', mimeType: '' } } as Job<QueueJobData>;

const roles: JobRole[] = [
  { id: 'j1', title: 'Go Dev', requiredSkills: ['Go'], preferredSkills: [], keywords: ['grpc'], requiredExperience: 2 },
  { id: 'j2', title: 'Designer', requiredSkills: ['Figma'], preferredSkills: [], keywords: [] },
];

describe('processMatchJob', () => {
  it('scores the resume against every role, saves matches and advances the pipeline', async () => {
    db.getResumeWithParsedData.mockResolvedValue({
      id: 'r-1',
      name: 'Jane',
      skills: ['Go', 'Docker'],
      experience: [{ duration: '3 years' }],
      education: [],
      parsed_data: { rawText: 'Built gRPC services' },
    });
    db.getJobRoles.mockResolvedValue(roles);

    const result = await processMatchJob(job);

    expect(result.status).toBe('completed');
    expect(result.resumeId).toBe('r-1');
    expect(result.matches.map((m) => m.roleId)).toEqual(['j1', 'j2']);
    expect(result.matches[0]).toMatchObject({ matchedSkills: ['Go'], missingSkills: [], experienceMatch: true });
    expect(result.matches[1]).toMatchObject({ missingSkills: ['Figma'] });

    expect(db.saveMatches).toHaveBeenCalledWith('r-1', result.matches);
    expect(db.updateResumeStatus).toHaveBeenCalledWith('r-1', 'matched');
    expect(queueHandler.triggerInsightsAggregation).toHaveBeenCalledWith('r-1');
  });

  it('feeds parsed fields to the role matcher with safe defaults', async () => {
    db.getResumeWithParsedData.mockResolvedValue({ id: 'r-1' });
    db.getJobRoles.mockResolvedValue([roles[0]]);
    const spy = vi.spyOn(RoleMatcher, 'match');

    await processMatchJob(job);

    expect(spy).toHaveBeenCalledWith(
      { name: undefined, email: undefined, phone: undefined, skills: [], experience: [], education: [], rawText: '' },
      roles[0]
    );
    spy.mockRestore();
  });

  it('saves an empty match set when there are no roles', async () => {
    db.getResumeWithParsedData.mockResolvedValue({ id: 'r-1' });
    db.getJobRoles.mockResolvedValue([]);

    const result = await processMatchJob(job);
    expect(result.matches).toEqual([]);
    expect(db.saveMatches).toHaveBeenCalledWith('r-1', []);
  });

  it('fails when the resume does not exist', async () => {
    db.getResumeWithParsedData.mockResolvedValue(null);

    await expect(processMatchJob(job)).rejects.toThrow('Resume r-1 not found');
    expect(db.saveMatches).not.toHaveBeenCalled();
    expect(db.updateResumeStatus).not.toHaveBeenCalled();
  });

  it('does not mark the resume matched when saving fails', async () => {
    db.getResumeWithParsedData.mockResolvedValue({ id: 'r-1' });
    db.getJobRoles.mockResolvedValue(roles);
    db.saveMatches.mockRejectedValueOnce(new Error('db down'));

    await expect(processMatchJob(job)).rejects.toThrow('db down');
    expect(db.updateResumeStatus).not.toHaveBeenCalled();
    expect(queueHandler.triggerInsightsAggregation).not.toHaveBeenCalled();
  });
});
