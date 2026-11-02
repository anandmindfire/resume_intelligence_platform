import { FastifyRequest, FastifyReply } from 'fastify';
import { getErrorMessage } from '../utils/errors';
import { analyticsService } from '../services/analyticsService';
import {
  validateLimit,
  validateMinScore,
  validatePage,
  validateSortOrder,
  sanitizeKeyword,
} from '../utils/validation';

export async function getDashboard(request: FastifyRequest, reply: FastifyReply) {
  try {
    const summary = await analyticsService.getDashboardSummary();
    return summary;
  } catch (error) {
    return reply.status(500).send({ error: getErrorMessage(error) });
  }
}

export async function getTopSkills(
  request: FastifyRequest<{ Querystring: { limit?: string } }>,
  reply: FastifyReply
) {
  try {
    const limit = validateLimit(request.query.limit, 10, 100);
    const skills = await analyticsService.getTopSkills(limit);
    return skills;
  } catch (error) {
    return reply.status(500).send({ error: getErrorMessage(error) });
  }
}

export async function getExperienceStats(request: FastifyRequest, reply: FastifyReply) {
  try {
    const stats = await analyticsService.getExperienceStats();
    return stats;
  } catch (error) {
    return reply.status(500).send({ error: getErrorMessage(error) });
  }
}

export async function getEducationStats(request: FastifyRequest, reply: FastifyReply) {
  try {
    const stats = await analyticsService.getEducationStats();
    return stats;
  } catch (error) {
    return reply.status(500).send({ error: getErrorMessage(error) });
  }
}

export async function getRoleMatches(
  request: FastifyRequest<{
    Querystring: { roleId?: string; minScore?: string; page?: string; limit?: string };
  }>,
  reply: FastifyReply
) {
  try {
    const roleId = request.query.roleId;
    const minScore = validateMinScore(request.query.minScore, 0);
    const page = validatePage(request.query.page, 1);
    const limit = validateLimit(request.query.limit, 10, 100);
    const result = await analyticsService.getRoleMatches(roleId, minScore, { page, limit });
    return result;
  } catch (error) {
    return reply.status(500).send({ error: getErrorMessage(error) });
  }
}

export async function getResumes(
  request: FastifyRequest<{
    Querystring: {
      keyword?: string;
      location?: string;
      minScore?: string;
      roleId?: string;
      page?: string;
      limit?: string;
      sortBy?: string;
      sortOrder?: string;
    };
  }>,
  reply: FastifyReply
) {
  try {
    const filters = {
      keyword: sanitizeKeyword(request.query.keyword),
      location: sanitizeKeyword(request.query.location),
      minScore: validateMinScore(request.query.minScore, 0),
      roleId: request.query.roleId,
    };
    const page = validatePage(request.query.page, 1);
    const limit = validateLimit(request.query.limit, 10, 100);
    const sortBy = request.query.sortBy || 'created_at';
    const sortOrder = validateSortOrder(request.query.sortOrder);
    const result = await analyticsService.getResumes(filters, { page, limit, sortBy, sortOrder });
    return result;
  } catch (error) {
    return reply.status(500).send({ error: getErrorMessage(error) });
  }
}

export async function getResumeById(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;
    const resume = await analyticsService.getResume(id);

    if (!resume) {
      return reply.status(404).send({ error: 'Resume not found' });
    }

    return resume;
  } catch (error) {
    return reply.status(500).send({ error: getErrorMessage(error) });
  }
}

export async function exportResumesCsv(
  request: FastifyRequest<{
    Body: {
      resumeIds?: string[];
    };
  }>,
  reply: FastifyReply
) {
  try {
    const { resumeIds } = request.body || {};
    const exportResult = await analyticsService.exportResumesToCSV(resumeIds);
    return exportResult;
  } catch (error) {
    return reply.status(500).send({ error: getErrorMessage(error) });
  }
}
