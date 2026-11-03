import { Job } from 'bullmq';
import { QueueJobData } from '@resume-platform/queue-lib';
import { RoleMatcher } from '@resume-platform/role-matching';
import { ExtractedResume } from '@resume-platform/resume-nlp';
import { logger, getErrorMessage, getErrorStack } from '@resume-platform/logger';
import { dbService } from '../services/dbService';
import { queueHandler } from '../queues/queueHandler';
import { RESUME_STATUS } from '../constants';

export async function processMatchJob(job: Job<QueueJobData>) {
  const { resumeId } = job.data;

  logger.info(`Processing match job for resume ${resumeId}`);

  try {
    // Get parsed resume data
    const resume = await dbService.getResumeWithParsedData(resumeId);
    if (!resume) {
      throw new Error(`Resume ${resumeId} not found`);
    }

    // Get all job roles
    const roles = await dbService.getJobRoles();

    // Match against each role
    const matches = roles.map((role) => {
      const extractedResume: ExtractedResume = {
        name: resume.name,
        email: resume.email,
        phone: resume.phone,
        skills: resume.skills || [],
        experience: resume.experience || [],
        education: resume.education || [],
        rawText: resume.parsed_data?.rawText || '',
      };

      return RoleMatcher.match(extractedResume, role);
    });

    // Save matches to database
    await dbService.saveMatches(resumeId, matches);

    // Update resume status
    await dbService.updateResumeStatus(resumeId, RESUME_STATUS.MATCHED);

    // Trigger insights aggregation
    await queueHandler.triggerInsightsAggregation(resumeId);

    logger.info(`Match completed for resume ${resumeId}`, {
      resumeId,
      matchesCount: matches.length,
    });

    return {
      resumeId,
      matches,
      status: 'completed',
    };
  } catch (error) {
    logger.error(`Match failed for resume ${resumeId}`, {
      error: getErrorMessage(error),
      stack: getErrorStack(error),
    });
    throw error;
  }
}
