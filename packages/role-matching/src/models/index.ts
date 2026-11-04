/** Job role requirements and criteria for candidate matching. */
export interface JobRole {
  id: string;
  title: string;
  requiredSkills: string[];
  preferredSkills: string[];
  requiredExperience?: number; // years
  keywords: string[];
  location?: string;
}

/** Result of matching a resume against a target job role. */
export interface MatchResult {
  roleId: string;
  roleTitle: string;
  matchScore: number;
  matchedSkills: string[];
  missingSkills: string[];
  experienceMatch: boolean;
  details: {
    skillScore: number;
    keywordScore: number;
    experienceScore: number;
  };
}
