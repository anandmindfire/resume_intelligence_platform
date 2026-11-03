import React from 'react';
import { Briefcase, MapPin, Clock, Tag, ArrowRight } from 'lucide-react';
import type { JobCardProps } from '../types';
import { normalizeMatchScore, formatMatchScore } from '../utils/formatters';
import { COPY } from '../constants';

export const JobCard: React.FC<JobCardProps> = ({
  job,
  matchCount = 0,
  avgMatchScore = 0,
  onClick,
}) => {
  const normalizedScore = normalizeMatchScore(avgMatchScore);
  const matchScoreColor =
    normalizedScore >= 70
      ? 'text-success-600'
      : normalizedScore >= 50
        ? 'text-warning-600'
        : 'text-neutral-400';

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-white rounded-xl border border-neutral-200 p-6 hover:shadow-xl hover:border-primary-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 transition-all duration-300 cursor-pointer group"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
              <Briefcase className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-neutral-900 group-hover:text-primary-600 transition-colors">
                {job.title}
              </h3>
              <span className="inline-block px-3 py-1 bg-primary-100 text-primary-700 rounded-full text-xs font-semibold mt-1">
                {job.domain}
              </span>
            </div>
          </div>
        </div>
        {(matchCount > 0 || avgMatchScore > 0) && (
          <div className="text-right">
            <div className={`text-2xl font-bold ${matchScoreColor}`}>
              {formatMatchScore(avgMatchScore)}
            </div>
            <div className="text-xs text-neutral-500">
              {matchCount} {matchCount !== 1 ? COPY.MATCH.MATCHES : COPY.MATCH.MATCH}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3 mb-4">
        <div className="flex items-center gap-2 text-sm text-neutral-600">
          <MapPin className="w-4 h-4 text-neutral-400" />
          <span>{job.location}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-neutral-600">
          <Clock className="w-4 h-4 text-neutral-400" />
          <span>{job.experienceRange}</span>
        </div>
      </div>

      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Tag className="w-4 h-4 text-neutral-400" />
          <span className="text-xs font-semibold text-neutral-500 uppercase">
            {COPY.LABELS.REQUIRED_SKILLS}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {job.skills.slice(0, 5).map((skill, index) => (
            <span
              key={index}
              className="px-2 py-1 bg-neutral-100 text-neutral-700 rounded-md text-xs font-medium"
            >
              {skill}
            </span>
          ))}
          {job.skills.length > 5 && (
            <span className="px-2 py-1 bg-neutral-100 text-neutral-500 rounded-md text-xs font-medium">
              +{job.skills.length - 5} more
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-neutral-100">
        <span className="text-sm text-neutral-500">
          {COPY.LABELS.JOB_ID}: {job.jobId}
        </span>
        <div className="flex items-center gap-2 text-primary-600 font-semibold text-sm group-hover:gap-3 transition-all">
          {COPY.LABELS.VIEW_DETAILS}
          <ArrowRight className="w-4 h-4" />
        </div>
      </div>
    </button>
  );
};
