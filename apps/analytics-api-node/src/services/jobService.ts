import { jobRepository, JobRole } from '../repositories/jobRepository';
import { matchRepository } from '../repositories/matchRepository';
import { ANALYTICS } from '../constants';

export interface JobMatchDetail {
  jobId: string;
  jobTitle: string;
  matchScore: number;
  skillsMatched: string[];
  skillsMissing: string[];
  experienceMatch: boolean;
  experienceDetails?: string;
  locationMatch: boolean;
  requirementsMet: number;
  requirementsTotal: number;
  matchedResumes: Array<{
    resumeId: string;
    resumeName: string;
    matchScore: number;
    skillsMatched: string[];
  }>;
}

export interface JobWithMatches extends JobRole {
  matchCount: number;
  avgMatchScore: number;
}

/** Match scores are stored on a 0-100 scale; report them on that scale, rounded to two decimals. */
function roundScore(score: number): number {
  return Math.round(score * 100) / 100;
}

class JobService {
  async getAllJobs(): Promise<JobRole[]> {
    return jobRepository.findAll();
  }

  async getJobById(id: string): Promise<JobRole | null> {
    return jobRepository.findById(id);
  }

  async getJobByJobId(jobId: string): Promise<JobRole | null> {
    return jobRepository.findByJobId(jobId);
  }

  async getJobMatches(jobId: string, minScore: number = 0): Promise<JobMatchDetail | null> {
    const job = await jobRepository.findById(jobId);
    if (!job) {
      return null;
    }

    // Get all matches for this job role
    const matches = await matchRepository.findByRole(job.id, minScore, ANALYTICS.MAX_RESUME_EXPORT_LIMIT);

    // Calculate aggregate statistics
    const totalScore = matches.reduce((sum, m) => sum + parseFloat(m.match_score || '0'), 0);
    const avgScore = matches.length > 0 ? totalScore / matches.length : 0;

    // Get matched resumes with details
    const matchedResumes = matches.map(match => ({
      resumeId: match.resume_id,
      resumeName: match.name || match.file_name || 'Unknown',
      matchScore: roundScore(parseFloat(match.match_score || '0')),
      skillsMatched: match.matched_skills || [],
    }));

    // Determine matched/missing skills from all matches
    const allMatchedSkills = new Set<string>();
    const allMissingSkills = new Set<string>();

    matches.forEach(match => {
      (match.matched_skills || []).forEach((skill: string) => allMatchedSkills.add(skill));
      (match.missing_skills || []).forEach((skill: string) => allMissingSkills.add(skill));
    });

    // Calculate requirements satisfaction based on how many required skills have at least one match
    const requiredSkills = job.requiredSkills || [];
    const requirementsTotal = requiredSkills.length + 1; // skills + experience requirement

    // Count how many required skills have been matched by at least one resume
    const matchedRequiredSkills = requiredSkills.filter(skill =>
      Array.from(allMatchedSkills).some(matched =>
        matched.toLowerCase() === skill.toLowerCase()
      )
    ).length;

    // Add 1 if any resume matches the experience requirement
    const experienceRequirementMet = matches.some(m => m.experience_match === true) ? 1 : 0;
    const requirementsMet = matchedRequiredSkills + experienceRequirementMet;

    return {
      jobId: job.id,
      jobTitle: job.title,
      matchScore: roundScore(avgScore),
      skillsMatched: Array.from(allMatchedSkills),
      skillsMissing: Array.from(allMissingSkills),
      experienceMatch: matches.some(m => m.experience_match === true),
      locationMatch: false, // TODO: Implement location matching logic
      requirementsMet,
      requirementsTotal,
      matchedResumes,
    };
  }

  async getAllJobsWithMatches(): Promise<JobWithMatches[]> {
    const jobs = await jobRepository.findAll();
    const jobsWithMatches: JobWithMatches[] = [];

    for (const job of jobs) {
      const matches = await matchRepository.findByRole(job.id, 0, ANALYTICS.MAX_RESUME_EXPORT_LIMIT);
      const totalScore = matches.reduce((sum, m) => sum + parseFloat(m.match_score || '0'), 0);
      const avgScore = matches.length > 0 ? totalScore / matches.length : 0;

      jobsWithMatches.push({
        ...job,
        matchCount: matches.length,
        avgMatchScore: roundScore(avgScore),
      });
    }

    return jobsWithMatches;
  }

  async seedJobs(mockJobs: Array<{
    jobId: string;
    title: string;
    domain: string;
    experienceRange: string;
    location: string;
    skills: string[];
    keywords: string[];
  }>): Promise<JobRole[]> {
    const jobsToCreate = mockJobs.map(mockJob => {
      // Parse experience range (e.g., "2-4 years" -> 2)
      const experienceMatch = mockJob.experienceRange.match(/(\d+)-(\d+)/);
      const minExperience = experienceMatch ? parseInt(experienceMatch[1]) : null;

      return {
        title: mockJob.title,
        requiredSkills: mockJob.skills,
        preferredSkills: [],
        requiredExperience: minExperience || undefined,
        keywords: mockJob.keywords,
        location: mockJob.location,
        description: `${mockJob.domain} position requiring ${mockJob.experienceRange} of experience.`,
      };
    });

    return jobRepository.bulkCreate(jobsToCreate);
  }

  async createJob(jobData: {
    title: string;
    requiredSkills?: string[];
    preferredSkills?: string[];
    requiredExperience?: number;
    keywords?: string[];
    location?: string;
    description?: string;
  }): Promise<JobRole> {
    return jobRepository.create({
      title: jobData.title,
      requiredSkills: jobData.requiredSkills || [],
      preferredSkills: jobData.preferredSkills || [],
      requiredExperience: jobData.requiredExperience,
      keywords: jobData.keywords || [],
      location: jobData.location,
      description: jobData.description,
    });
  }
}

export const jobService = new JobService();
