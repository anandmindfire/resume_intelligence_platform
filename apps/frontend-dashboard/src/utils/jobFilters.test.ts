import { describe, expect, it } from 'vitest';
import { filterJobs } from './jobFilters';
import { makeJob } from '../test/fixtures';

const JOBS = [
  makeJob({
    jobId: 'J1',
    title: 'Frontend Developer',
    domain: 'Web',
    location: 'Remote',
    skills: ['React'],
  }),
  makeJob({
    jobId: 'J2',
    title: 'Backend Engineer',
    domain: 'Backend',
    location: 'Berlin, DE',
    skills: ['Go', 'Postgres'],
  }),
  makeJob({
    jobId: 'J3',
    title: 'Data Scientist',
    domain: 'Data',
    location: 'Remote',
    skills: ['Python'],
  }),
];

describe('filterJobs', () => {
  it('returns all jobs with default criteria', () => {
    expect(
      filterJobs(JOBS, { searchQuery: '', domainFilter: 'all', locationFilter: 'all' })
    ).toEqual(JOBS);
  });

  it('matches search text case-insensitively across title, domain and skills', () => {
    expect(
      filterJobs(JOBS, { searchQuery: 'backend', domainFilter: 'all', locationFilter: 'all' }).map(
        (j) => j.jobId
      )
    ).toEqual(['J2']);
    expect(
      filterJobs(JOBS, { searchQuery: 'DATA', domainFilter: 'all', locationFilter: 'all' }).map(
        (j) => j.jobId
      )
    ).toEqual(['J3']);
    expect(
      filterJobs(JOBS, { searchQuery: 'postgres', domainFilter: 'all', locationFilter: 'all' }).map(
        (j) => j.jobId
      )
    ).toEqual(['J2']);
  });

  it('filters by domain and location', () => {
    expect(
      filterJobs(JOBS, { searchQuery: '', domainFilter: 'all', locationFilter: 'Remote' }).map(
        (j) => j.jobId
      )
    ).toEqual(['J1', 'J3']);
    expect(
      filterJobs(JOBS, { searchQuery: '', domainFilter: 'Data', locationFilter: 'Remote' }).map(
        (j) => j.jobId
      )
    ).toEqual(['J3']);
  });

  it('returns an empty array when nothing matches', () => {
    expect(
      filterJobs(JOBS, { searchQuery: 'zzz', domainFilter: 'all', locationFilter: 'all' })
    ).toEqual([]);
  });
});
