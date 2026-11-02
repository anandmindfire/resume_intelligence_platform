/** Job listing (UI + API shape) */
export interface Job {
  jobId: string;
  title: string;
  domain: string;
  experienceRange: string;
  location: string;
  skills: string[];
  keywords: string[];
}

/** Matched resume summary inside JobMatchDetail */
export interface MatchedResumeSummary {
  resumeId: string;
  resumeName: string;
  /** Match score on a 0-100 scale */
  matchScore: number;
  skillsMatched: string[];
}

/** Job match detail from API */
export interface JobMatchDetail {
  jobId: string;
  jobTitle: string;
  /** Overall match score on a 0-100 scale */
  matchScore: number;
  skillsMatched: string[];
  skillsMissing: string[];
  experienceMatch: boolean;
  experienceDetails?: string;
  locationMatch: boolean;
  requirementsMet: number;
  requirementsTotal: number;
  matchedResumes?: MatchedResumeSummary[];
}

/** JobCard component props */
export interface JobCardProps {
  job: Job;
  matchCount?: number;
  /** Average match score on a 0-100 scale */
  avgMatchScore?: number;
  onClick: () => void;
}

import type { Resume } from './resume';

/** JobDetailModal component props */
export interface JobDetailModalProps {
  job: Job;
  matchDetail?: JobMatchDetail | null;
  isOpen: boolean;
  onClose: () => void;
  onViewResume?: (resumeId: string) => void;
  /** Resume loaded by parent when user clicks a matched resume (from onViewResume) */
  selectedResume?: Resume | null;
  onCloseResumeDetail?: () => void;
  getResumeFileUrl?: (id: string) => string;
}
