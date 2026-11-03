import { describe, expect, it } from 'vitest';
import { sortMatchedResumesByScore } from './matchUtils';
import type { MatchedResumeSummary } from '../types';

function match(resumeId: string, matchScore: number): MatchedResumeSummary {
  return { resumeId, resumeName: resumeId, matchScore, skillsMatched: [] };
}

describe('sortMatchedResumesByScore', () => {
  it('sorts descending by normalised match score', () => {
    const input = [match('a', 60), match('b', 90), match('c', 10)];
    expect(sortMatchedResumesByScore(input).map((m) => m.resumeId)).toEqual(['b', 'a', 'c']);
  });

  it('does not mutate the input array', () => {
    const input = [match('a', 10), match('b', 90)];
    const copy = [...input];
    sortMatchedResumesByScore(input);
    expect(input).toEqual(copy);
  });

  it('returns an empty array for no matches', () => {
    expect(sortMatchedResumesByScore([])).toEqual([]);
  });
});
