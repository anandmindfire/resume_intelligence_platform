import type { Job, JobMatchDetail, Resume, RoleMatch } from '../types';

export function makeResume(overrides: Partial<Resume> = {}): Resume {
  return {
    id: 'r-1',
    file_name: 'jane_doe.pdf',
    name: 'Jane Doe',
    email: 'jane@example.com',
    phone: '555-0100',
    skills: ['React', 'TypeScript'],
    experience: [{ title: 'Engineer', company: 'Acme', duration: '2 years' }],
    education: [{ institution: 'MIT', degree: 'BSc', year: '2018' }],
    status: 'completed',
    created_at: '2024-03-15T10:00:00.000Z',
    ...overrides,
  };
}

export function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    jobId: 'JOB-1',
    title: 'Frontend Developer',
    domain: 'Web',
    experienceRange: '2+ years',
    location: 'Remote',
    skills: ['React', 'TypeScript', 'CSS'],
    keywords: ['frontend'],
    ...overrides,
  };
}

export function makeMatchDetail(overrides: Partial<JobMatchDetail> = {}): JobMatchDetail {
  return {
    jobId: 'JOB-1',
    jobTitle: 'Frontend Developer',
    matchScore: 80,
    skillsMatched: ['React'],
    skillsMissing: ['CSS'],
    experienceMatch: true,
    locationMatch: true,
    requirementsMet: 3,
    requirementsTotal: 4,
    matchedResumes: [
      { resumeId: 'r-1', resumeName: 'Jane Doe', matchScore: 60, skillsMatched: ['react'] },
      { resumeId: 'r-2', resumeName: 'John Roe', matchScore: 90, skillsMatched: ['TypeScript'] },
    ],
    ...overrides,
  };
}

export function makeRoleMatch(overrides: Partial<RoleMatch> = {}): RoleMatch {
  return {
    role_id: 'role-1',
    role_title: 'Frontend Developer',
    resume_id: 'r-1',
    name: 'Jane Doe',
    file_name: 'jane.pdf',
    match_score: 75,
    matched_skills: ['React', 'TypeScript'],
    ...overrides,
  };
}
