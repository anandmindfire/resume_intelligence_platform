import { describe, expect, it } from 'vitest';
import * as services from './index';

describe('services barrel', () => {
  it('re-exports all services', () => {
    expect(Object.keys(services).sort()).toEqual(
      ['analyticsService', 'apiClient', 'getResumeFileUrl', 'jobService', 'resumeService', 'uploadService'].sort()
    );
  });
});
