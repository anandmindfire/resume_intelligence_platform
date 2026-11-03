import React from 'react';
import {
  X,
  CheckCircle,
  XCircle,
  Briefcase,
  MapPin,
  Clock,
  Users,
  Target,
  Award,
  Eye,
} from 'lucide-react';
import type { JobDetailModalProps } from '../types';
import { normalizeMatchScore, formatMatchScore } from '../utils/formatters';
import { sortMatchedResumesByScore } from '../utils/matchUtils';
import { ResumeDetailModal } from './ResumeDetailModal';
import { useModalA11y } from '../hooks/useModalA11y';
import { COPY } from '../constants';

const JOB_DETAIL_MODAL_TITLE_ID = 'job-detail-modal-title';
const NOOP = () => {};

export const JobDetailModal: React.FC<JobDetailModalProps> = ({
  job,
  matchDetail,
  isOpen,
  onClose,
  onViewResume,
  selectedResume = null,
  onCloseResumeDetail,
  getResumeFileUrl,
}) => {
  const containerRef = useModalA11y(isOpen, onClose);

  if (!isOpen) return null;

  const requirementsTotal = matchDetail?.requirementsTotal ?? job.skills.length + 1;
  const requirementsMet = matchDetail?.requirementsMet ?? 0;
  const requirementsPercentage =
    requirementsTotal > 0 ? (requirementsMet / requirementsTotal) * 100 : 0;

  const skillMatches = job.skills.map((skill) => {
    const matched =
      matchDetail?.matchedResumes?.some((mr) =>
        mr.skillsMatched.some((sm) => sm.toLowerCase() === skill.toLowerCase())
      ) ?? false;
    return { skill, matched };
  });

  const handleResumeClick = (resumeId: string) => {
    if (onViewResume) {
      onViewResume(resumeId);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={onClose}
          className="fixed inset-0 bg-neutral-900 bg-opacity-75 transition-opacity cursor-default"
        />

        <div
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={JOB_DETAIL_MODAL_TITLE_ID}
          tabIndex={-1}
          className="inline-block align-bottom bg-white rounded-xl text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full"
        >
          <div className="bg-gradient-to-r from-primary-600 to-primary-700 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                <Briefcase className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 id={JOB_DETAIL_MODAL_TITLE_ID} className="text-2xl font-bold text-white">
                  {job.title}
                </h2>
                <p className="text-primary-100 text-sm">
                  {job.domain} • {job.jobId}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close dialog"
              className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="px-6 py-6 max-h-[calc(100vh-200px)] overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="flex items-center gap-3 p-4 bg-neutral-50 rounded-lg">
                <MapPin className="w-5 h-5 text-primary-600" />
                <div>
                  <div className="text-xs text-neutral-500 uppercase font-semibold">
                    {COPY.LABELS.LOCATION}
                  </div>
                  <div className="text-neutral-900 font-medium">{job.location}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-neutral-50 rounded-lg">
                <Clock className="w-5 h-5 text-primary-600" />
                <div>
                  <div className="text-xs text-neutral-500 uppercase font-semibold">
                    {COPY.LABELS.EXPERIENCE}
                  </div>
                  <div className="text-neutral-900 font-medium">{job.experienceRange}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-neutral-50 rounded-lg">
                <Users className="w-5 h-5 text-primary-600" />
                <div>
                  <div className="text-xs text-neutral-500 uppercase font-semibold">
                    {COPY.LABELS.MATCHED_RESUMES}
                  </div>
                  <div className="text-neutral-900 font-medium">
                    {matchDetail?.matchedResumes?.length ?? 0} resume
                    {(matchDetail?.matchedResumes?.length ?? 0) !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
            </div>

            {matchDetail && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
                    <Target className="w-5 h-5 text-primary-600" />
                    {COPY.LABELS.OVERALL_MATCH_SCORE}
                  </h3>
                  <span
                    className={`text-3xl font-bold ${
                      normalizeMatchScore(matchDetail.matchScore) >= 70
                        ? 'text-success-600'
                        : normalizeMatchScore(matchDetail.matchScore) >= 50
                          ? 'text-warning-600'
                          : 'text-neutral-400'
                    }`}
                  >
                    {formatMatchScore(matchDetail.matchScore)}
                  </span>
                </div>
                <div className="w-full bg-neutral-200 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all ${
                      normalizeMatchScore(matchDetail.matchScore) >= 70
                        ? 'bg-success-500'
                        : normalizeMatchScore(matchDetail.matchScore) >= 50
                          ? 'bg-warning-500'
                          : 'bg-neutral-400'
                    }`}
                    style={{
                      width: `${normalizeMatchScore(matchDetail.matchScore)}%`,
                    }}
                  />
                </div>
              </div>
            )}

            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
                  <Award className="w-5 h-5 text-primary-600" />
                  {COPY.LABELS.REQUIREMENTS_SATISFACTION}
                </h3>
                <span className="text-sm text-neutral-600">
                  {COPY.MATCH.REQUIREMENTS_MET(
                    requirementsMet,
                    requirementsTotal,
                    requirementsPercentage
                  )}
                </span>
              </div>
              <div className="w-full bg-neutral-200 rounded-full h-2 mb-4">
                <div
                  className={`h-2 rounded-full transition-all ${
                    requirementsPercentage >= 70
                      ? 'bg-success-500'
                      : requirementsPercentage >= 50
                        ? 'bg-warning-500'
                        : 'bg-danger-500'
                  }`}
                  style={{ width: `${requirementsPercentage}%` }}
                />
              </div>
              <div className="space-y-2">
                <h4 className="font-semibold text-neutral-700 mb-3">
                  {COPY.LABELS.REQUIRED_SKILLS}:
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {skillMatches.map(({ skill, matched }, index) => (
                    <div
                      key={index}
                      className={`flex items-center gap-2 p-3 rounded-lg border ${
                        matched
                          ? 'bg-success-50 border-success-200'
                          : 'bg-danger-50 border-danger-200'
                      }`}
                    >
                      {matched ? (
                        <CheckCircle className="w-5 h-5 text-success-600 flex-shrink-0" />
                      ) : (
                        <XCircle className="w-5 h-5 text-danger-600 flex-shrink-0" />
                      )}
                      <span
                        className={`font-medium ${
                          matched ? 'text-success-900' : 'text-danger-900'
                        }`}
                      >
                        {skill}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {matchDetail?.matchedResumes && matchDetail.matchedResumes.length > 0 && (
              <div className="mt-6">
                <h3 className="text-lg font-bold text-neutral-900 mb-4 flex items-center gap-2">
                  <Users className="w-5 h-5 text-primary-600" />
                  {COPY.LABELS.MATCHED_RESUMES} ({matchDetail.matchedResumes.length})
                </h3>
                <div className="space-y-3">
                  {sortMatchedResumesByScore(matchDetail.matchedResumes).map((match) => (
                    <button
                      type="button"
                      key={match.resumeId}
                      className="w-full text-left p-4 bg-neutral-50 rounded-lg border border-neutral-200 hover:border-primary-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 transition-all cursor-pointer"
                      onClick={() => handleResumeClick(match.resumeId)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold text-neutral-900">{match.resumeName}</h4>
                            <Eye className="w-4 h-4 text-primary-600" />
                          </div>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {match.skillsMatched.slice(0, 5).map((skill, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-1 bg-success-100 text-success-800 rounded-md text-xs font-medium"
                              >
                                {skill}
                              </span>
                            ))}
                            {match.skillsMatched.length > 5 && (
                              <span className="px-2 py-1 bg-neutral-100 text-neutral-600 rounded-md text-xs font-medium">
                                +{match.skillsMatched.length - 5} more
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right ml-4">
                          <div
                            className={`text-2xl font-bold ${
                              normalizeMatchScore(match.matchScore) >= 70
                                ? 'text-success-600'
                                : normalizeMatchScore(match.matchScore) >= 50
                                  ? 'text-warning-600'
                                  : 'text-neutral-400'
                            }`}
                          >
                            {formatMatchScore(match.matchScore)}
                          </div>
                          <div className="text-xs text-neutral-500">{COPY.LABELS.MATCH_SCORE}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {(!matchDetail?.matchedResumes || matchDetail.matchedResumes.length === 0) && (
              <div className="text-center py-8 text-neutral-500">
                <Users className="w-12 h-12 mx-auto mb-3 text-neutral-300" />
                <p>{COPY.EMPTY.NO_MATCHES_FOR_JOB}</p>
              </div>
            )}
          </div>

          <div className="px-6 py-4 bg-neutral-50 border-t border-neutral-200 flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 transition-colors"
            >
              {COPY.LABELS.CLOSE}
            </button>
          </div>
        </div>
      </div>

      <ResumeDetailModal
        resume={selectedResume}
        onClose={onCloseResumeDetail ?? NOOP}
        getResumeFileUrl={getResumeFileUrl}
      />
    </div>
  );
};
