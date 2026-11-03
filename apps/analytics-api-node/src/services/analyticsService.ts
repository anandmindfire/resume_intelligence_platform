import { resumeRepository } from '../repositories/resumeRepository';
import { matchRepository } from '../repositories/matchRepository';
import { analyticsRepository } from '../repositories/analyticsRepository';
import { ResumeFilters } from '../types';
import { ANALYTICS, RESUME_STATUS } from '../constants';

class AnalyticsService {
  async getDashboardSummary() {
    const [totalResumes, processedResumes, topSkills, roleMatches] = await Promise.all([
      resumeRepository.count(),
      resumeRepository.countByStatus(RESUME_STATUS.MATCHED),
      analyticsRepository.getTopSkills(ANALYTICS.DEFAULT_TOP_SKILLS_LIMIT),
      matchRepository.getSummaryByRole(),
    ]);

    return {
      totalResumes,
      processedResumes,
      topSkills,
      roleMatches,
    };
  }

  async getTopSkills(limit: number) {
    return analyticsRepository.getTopSkills(limit);
  }

  async getExperienceStats() {
    return analyticsRepository.getExperienceStats();
  }

  async getEducationStats() {
    return analyticsRepository.getEducationStats(ANALYTICS.DEFAULT_EDUCATION_STATS_LIMIT);
  }

  async getRoleMatches(
    roleId?: string,
    minScore: number = 0,
    pagination?: { page: number; limit: number }
  ) {
    const page = pagination?.page ?? 1;
    const limit = pagination?.limit ?? ANALYTICS.DEFAULT_MATCH_LIMIT;
    const offset = (page - 1) * limit;

    const [data, total, uniqueRoles] = await Promise.all([
      matchRepository.findByRole(roleId, minScore, limit, offset),
      matchRepository.countByRole(roleId, minScore),
      matchRepository.getRolesWithMatches(minScore),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      uniqueRoles,
    };
  }

  async getResumes(
    filters: ResumeFilters,
    pagination?: { page: number; limit: number; sortBy: string; sortOrder: 'asc' | 'desc' }
  ) {
    const page = pagination?.page ?? 1;
    const limit = pagination?.limit ?? ANALYTICS.DEFAULT_RESUME_LIST_LIMIT;
    const sortBy = pagination?.sortBy ?? 'created_at';
    const sortOrder = pagination?.sortOrder ?? 'desc';
    const offset = (page - 1) * limit;

    const [data, total] = await Promise.all([
      resumeRepository.findAll(filters, limit, offset, sortBy, sortOrder),
      resumeRepository.countWithFilters(filters),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async getResume(id: string) {
    return resumeRepository.findById(id);
  }

  async exportResumesToCSV(resumeIds?: string[]) {
    // For now, return the resumes data directly for client-side CSV generation
    // In production, this could queue an export job to the export-worker
    const filters: ResumeFilters = {};
    const resumes = await resumeRepository.findAll(filters, ANALYTICS.MAX_RESUME_EXPORT_LIMIT);

    // Filter by resumeIds if provided
    const filteredResumes = resumeIds && resumeIds.length > 0
      ? resumes.filter(r => resumeIds.includes(r.id))
      : resumes;

    return filteredResumes;
  }
}

export const analyticsService = new AnalyticsService();
