import React from 'react';
import { StatusBadge, EmptyState } from './common';
import { formatDate } from '../utils/formatters';
import { Eye, Trash2, Download } from 'lucide-react';
import type { ResumeTableProps } from '../types';
import { resumeService } from '../services/resumeService';
import { COPY } from '../constants';

const TABLE_COLUMNS = 9;

export const ResumeTable: React.FC<ResumeTableProps> = ({
  resumes,
  onRowClick,
  onDelete,
  getResumeFileUrl = resumeService.getResumeFileUrl,
}) => {
  const showActions = Boolean(onRowClick || onDelete);
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
      <table className="table">
        <thead>
          <tr>
            <th>{COPY.TABLE.FILE_NAME}</th>
            <th>{COPY.LABELS.NAME}</th>
            <th>{COPY.LABELS.EMAIL}</th>
            <th>{COPY.LABELS.PHONE}</th>
            <th>{COPY.LABELS.SKILLS}</th>
            <th>{COPY.TABLE.EXPERIENCE_COUNT}</th>
            <th>{COPY.TABLE.EDUCATION_COUNT}</th>
            <th>{COPY.LABELS.STATUS}</th>
            <th>{COPY.TABLE.CREATED_AT}</th>
            {showActions && <th>{COPY.TABLE.ACTIONS}</th>}
          </tr>
        </thead>
        <tbody>
          {resumes.map((resume) => (
            <tr
              key={resume.id}
              className={onRowClick ? 'cursor-pointer' : ''}
              onClick={() => onRowClick?.(resume)}
            >
              <td className="font-medium">{resume.file_name}</td>
              <td>{resume.name || <span className="text-neutral-400">-</span>}</td>
              <td>{resume.email || <span className="text-neutral-400">-</span>}</td>
              <td>{resume.phone || <span className="text-neutral-400">-</span>}</td>
              <td>
                <div className="flex flex-wrap gap-1">
                  {(resume.skills || []).slice(0, 3).map((skill, idx) => (
                    <span key={idx} className="skill-tag">
                      {skill}
                    </span>
                  ))}
                  {(resume.skills || []).length > 3 && (
                    <span className="skill-tag opacity-70">
                      +{(resume.skills || []).length - 3}
                    </span>
                  )}
                  {(!resume.skills || resume.skills.length === 0) && (
                    <span className="text-neutral-400 text-xs">-</span>
                  )}
                </div>
              </td>
              <td>
                <span className="badge badge-info">{(resume.experience || []).length}</span>
              </td>
              <td>
                <span className="badge badge-info">{(resume.education || []).length}</span>
              </td>
              <td>
                <StatusBadge status={resume.status} />
              </td>
              <td className="text-sm text-neutral-600">{formatDate(resume.created_at)}</td>
              {showActions && (
                <td>
                  <div className="flex gap-2">
                    {onRowClick && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRowClick(resume);
                        }}
                        className="p-2 text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                        title={COPY.LABELS.VIEW_DETAILS}
                        aria-label={COPY.LABELS.VIEW_DETAILS}
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    )}
                    <a
                      href={getResumeFileUrl(resume.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-2 text-info-600 hover:bg-info-50 rounded-lg transition-colors"
                      title="Download Original"
                      aria-label="Download Original"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                    {onDelete && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(resume.id);
                        }}
                        className="p-2 text-danger-600 hover:bg-danger-50 rounded-lg transition-colors"
                        title="Delete"
                        aria-label="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
          {resumes.length === 0 && (
            <tr>
              <td
                colSpan={showActions ? TABLE_COLUMNS + 1 : TABLE_COLUMNS}
                className="text-center py-12"
              >
                <EmptyState icon="📄" title={COPY.EMPTY.NO_RESUMES} />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
