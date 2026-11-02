import { describe, expect, it } from 'vitest';
import type { ExtractedResume, Experience } from '@resume-platform/resume-nlp';
import type { JobRole } from '../models';
import { RoleMatcher } from './index';

function makeResume(overrides: Partial<ExtractedResume> = {}): ExtractedResume {
  return {
    skills: [],
    experience: [],
    education: [],
    rawText: '',
    ...overrides,
  };
}

function makeRole(overrides: Partial<JobRole> = {}): JobRole {
  return {
    id: 'role-1',
    title: 'Backend Engineer',
    requiredSkills: [],
    preferredSkills: [],
    keywords: [],
    ...overrides,
  };
}

const years = (...durations: string[]): Experience[] => durations.map((duration) => ({ duration }));

describe('RoleMatcher.match', () => {
  it('scores 100 when the role has no requirements at all', () => {
    const result = RoleMatcher.match(makeResume(), makeRole());

    expect(result).toEqual({
      roleId: 'role-1',
      roleTitle: 'Backend Engineer',
      matchScore: 100,
      matchedSkills: [],
      missingSkills: [],
      experienceMatch: true,
      details: { skillScore: 100, keywordScore: 100, experienceScore: 100 },
    });
  });

  it('weights skills 50%, experience 40% and keywords 10%', () => {
    // skills: 1/2 required (0.5*0.8) + no preferred (1*0.2) = 0.6
    // keywords: 1/4 = 0.25
    // experience: 2y of 4y required -> 1 - (2/4)*1.5 = 0.25
    const resume = makeResume({
      skills: ['Node.js'],
      rawText: 'Worked on payments',
      experience: years('2 years'),
    });
    const role = makeRole({
      requiredSkills: ['Node.js', 'Go'],
      keywords: ['payments', 'fintech', 'ledger', 'banking'],
      requiredExperience: 4,
    });

    const result = RoleMatcher.match(resume, role);

    expect(result.details).toEqual({ skillScore: 60, keywordScore: 25, experienceScore: 25 });
    expect(result.matchScore).toBeCloseTo(0.6 * 50 + 0.25 * 40 + 0.25 * 10, 2);
  });

  describe('skills', () => {
    it('weights required skills 80% and preferred skills 20%', () => {
      const role = makeRole({ requiredSkills: ['Python'], preferredSkills: ['Docker', 'AWS'] });
      const result = RoleMatcher.match(makeResume({ skills: ['python', 'docker'] }), role);
      // required 1/1 * 0.8 + preferred 1/2 * 0.2 = 0.9
      expect(result.details.skillScore).toBe(90);
    });

    it('treats an empty required list as fully satisfied', () => {
      const role = makeRole({ preferredSkills: ['Docker', 'AWS'] });
      const result = RoleMatcher.match(makeResume({ skills: [] }), role);
      expect(result.details.skillScore).toBe(80);
    });

    it('matches skills case-insensitively on word boundaries', () => {
      const role = makeRole({ requiredSkills: ['Java'] });

      expect(RoleMatcher.match(makeResume({ skills: ['JAVA'] }), role).missingSkills).toEqual([]);
      expect(RoleMatcher.match(makeResume({ skills: ['Java 17'] }), role).missingSkills).toEqual([]);
      expect(RoleMatcher.match(makeResume({ skills: ['JavaScript'] }), role).missingSkills).toEqual(['Java']);
    });

    it('escapes regex metacharacters in skill names', () => {
      const role = makeRole({ requiredSkills: ['C++', 'Node.js'] });
      const result = RoleMatcher.match(makeResume({ skills: ['NodeXjs', 'C'] }), role);
      expect(result.missingSkills).toEqual(['C++', 'Node.js']);
    });

    it('reports matched skills from both required and preferred lists, as written on the resume', () => {
      const role = makeRole({ requiredSkills: ['react'], preferredSkills: ['graphql'] });
      const result = RoleMatcher.match(makeResume({ skills: ['React', 'GraphQL', 'Rust'] }), role);
      expect(result.matchedSkills).toEqual(['React', 'GraphQL']);
    });

    it('reports only required skills as missing', () => {
      const role = makeRole({ requiredSkills: ['Go', 'SQL'], preferredSkills: ['Kafka'] });
      const result = RoleMatcher.match(makeResume({ skills: ['SQL'] }), role);
      expect(result.missingSkills).toEqual(['Go']);
    });
  });

  describe('keywords', () => {
    it('scores the fraction of keywords found in the raw text', () => {
      const role = makeRole({ keywords: ['microservices', 'kafka'] });
      const result = RoleMatcher.match(makeResume({ rawText: 'Designed Microservices at scale' }), role);
      expect(result.details.keywordScore).toBe(50);
    });

    it('requires whole-word keyword matches', () => {
      const role = makeRole({ keywords: ['go'] });
      const result = RoleMatcher.match(makeResume({ rawText: 'Google and MongoDB' }), role);
      expect(result.details.keywordScore).toBe(0);
    });
  });

  describe('experience', () => {
    it('is fully satisfied when the role has no experience requirement', () => {
      const result = RoleMatcher.match(makeResume(), makeRole());
      expect(result.experienceMatch).toBe(true);
      expect(result.details.experienceScore).toBe(100);
    });

    it('sums durations across all positions', () => {
      const role = makeRole({ requiredExperience: 3 });
      const result = RoleMatcher.match(makeResume({ experience: years('1 year', '2 years') }), role);
      expect(result.experienceMatch).toBe(true);
      expect(result.details.experienceScore).toBe(100);
    });

    it('adds a 5% bonus per extra year, capped at 120%', () => {
      const role = makeRole({ requiredExperience: 2 });
      expect(RoleMatcher.match(makeResume({ experience: years('4 years') }), role).details.experienceScore).toBe(110);
      expect(RoleMatcher.match(makeResume({ experience: years('20 years') }), role).details.experienceScore).toBe(120);
    });

    it('penalises missing experience at 1.5x the shortfall ratio, floored at 0', () => {
      const role = makeRole({ requiredExperience: 10 });
      // 8 of 10 -> 1 - 0.2*1.5 = 0.7
      expect(RoleMatcher.match(makeResume({ experience: years('8 years') }), role).details.experienceScore).toBe(70);
      // 2 of 10 -> 1 - 0.8*1.5 < 0 -> 0
      const result = RoleMatcher.match(makeResume({ experience: years('2 years') }), role);
      expect(result.details.experienceScore).toBe(0);
      expect(result.experienceMatch).toBe(false);
    });

    it('treats missing experience data as zero years', () => {
      const role = makeRole({ requiredExperience: 1 });
      const result = RoleMatcher.match(makeResume({ experience: undefined as unknown as Experience[] }), role);
      expect(result.experienceMatch).toBe(false);
    });

    it.each([
      ['2 years', 2],
      ['1 year', 1],
      ['1.5 years', 1.5],
      ['6 months', 0.5],
      ['1 year 6 months', 1.5],
      ['Less than 1 year', 0.5],
      ['3', 3],
      ['', 0],
      ['ongoing', 0],
    ])('parses duration "%s" as %d years', (duration, expectedYears) => {
      // With requiredExperience = 10 the experience score is linear in years below the requirement.
      const role = makeRole({ requiredExperience: 10 });
      const result = RoleMatcher.match(makeResume({ experience: years(duration) }), role);
      const expectedScore = Math.max(1 - ((10 - expectedYears) / 10) * 1.5, 0);
      expect(result.details.experienceScore).toBeCloseTo(expectedScore * 100, 2);
    });

    it('ignores positions without a duration', () => {
      const role = makeRole({ requiredExperience: 2 });
      const result = RoleMatcher.match(makeResume({ experience: [{ title: 'Dev' }, { duration: '2 years' }] }), role);
      expect(result.experienceMatch).toBe(true);
    });
  });

  it('rounds scores to two decimal places', () => {
    const role = makeRole({ requiredSkills: ['a', 'b', 'c'] });
    const result = RoleMatcher.match(makeResume({ skills: ['a'] }), role);
    // (1/3 * 0.8 + 0.2) = 0.4666… -> 46.67
    expect(result.details.skillScore).toBe(46.67);
  });

  it('can exceed 100 overall when the experience bonus applies', () => {
    // Documents current behaviour: the overall score is not clamped, so a perfect
    // skills/keywords match plus surplus experience yields more than 100.
    const role = makeRole({ requiredExperience: 1 });
    const result = RoleMatcher.match(makeResume({ experience: years('5 years') }), role);
    expect(result.matchScore).toBe(108);
  });
});
