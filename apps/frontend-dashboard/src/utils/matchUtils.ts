import type { MatchedResumeSummary } from '../types';
import { normalizeMatchScore } from './formatters';

/** Returns a new array of matched resumes sorted by match score, highest first. */
export function sortMatchedResumesByScore(resumes: MatchedResumeSummary[]): MatchedResumeSummary[] {
  return [...resumes].sort(
    (a, b) => normalizeMatchScore(b.matchScore) - normalizeMatchScore(a.matchScore)
  );
}
