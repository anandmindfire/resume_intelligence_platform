import React from 'react';
import {
  X,
  Mail,
  Phone,
  User,
  Briefcase,
  GraduationCap,
  MapPin,
  Calendar,
  FileText,
} from 'lucide-react';
import type { ResumeDetailModalProps } from '../types';
import { COPY } from '../constants';
import { resumeService } from '../services/resumeService';

export const ResumeDetailModal: React.FC<ResumeDetailModalProps> = ({
  resume,
  onClose,
  getResumeFileUrl = resumeService.getResumeFileUrl,
}) => {
  if (!resume) return null;

  const fileUrl = getResumeFileUrl(resume.id);
  const skills = resume.skills ?? [];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div
          className="fixed inset-0 transition-opacity bg-gray-900 bg-opacity-75"
          onClick={onClose}
        />

        <div className="inline-block align-bottom bg-white rounded-2xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
          <div className="bg-gradient-to-r from-primary-600 to-primary-700 px-6 py-5 flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-bold text-white">{resume.file_name}</h3>
              <p className="text-primary-100 text-sm mt-1">{COPY.LABELS.RESUME_DETAILS}</p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="px-6 py-6 max-h-[calc(100vh-200px)] overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gradient-to-br from-blue-50 to-white rounded-xl p-5 border border-blue-100">
                <div className="flex items-center gap-2 mb-4">
                  <User className="w-5 h-5 text-blue-600" />
                  <h4 className="text-lg font-bold text-gray-900">
                    {COPY.LABELS.CONTACT_INFORMATION}
                  </h4>
                </div>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <User className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-500">{COPY.LABELS.NAME}</p>
                      <p className="font-semibold text-gray-900">{resume.name || '-'}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Mail className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-500">{COPY.LABELS.EMAIL}</p>
                      <p className="font-semibold text-gray-900">{resume.email || '-'}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Phone className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-500">{COPY.LABELS.PHONE}</p>
                      <p className="font-semibold text-gray-900">{resume.phone || '-'}</p>
                    </div>
                  </div>
                  {resume.location && (
                    <div className="flex items-start gap-3">
                      <MapPin className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500">{COPY.LABELS.LOCATION}</p>
                        <p className="font-semibold text-gray-900">{resume.location}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-gradient-to-br from-purple-50 to-white rounded-xl p-5 border border-purple-100">
                <div className="flex items-center gap-2 mb-4">
                  <Briefcase className="w-5 h-5 text-purple-600" />
                  <h4 className="text-lg font-bold text-gray-900">{COPY.LABELS.SKILLS}</h4>
                </div>
                <div className="flex flex-wrap gap-2">
                  {skills.length > 0 ? (
                    skills.map((skill, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-sm font-medium border border-purple-200"
                      >
                        {skill}
                      </span>
                    ))
                  ) : (
                    <span className="text-gray-400 text-sm">No skills listed</span>
                  )}
                </div>
              </div>

              <div className="bg-gradient-to-br from-amber-50 to-white rounded-xl p-5 border border-amber-100">
                <div className="flex items-center gap-2 mb-4">
                  <Briefcase className="w-5 h-5 text-amber-600" />
                  <h4 className="text-lg font-bold text-gray-900">
                    {COPY.LABELS.EXPERIENCE}
                  </h4>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                      <Briefcase className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">
                        {(resume.experience || []).length} Position
                        {(resume.experience || []).length !== 1 ? 's' : ''}
                      </p>
                      <p className="text-sm text-gray-500">Work experience entries</p>
                    </div>
                  </div>
                  {(resume.experience || []).length > 0 && (
                    <div className="mt-4 space-y-2">
                      {(resume.experience || []).slice(0, 3).map((exp: unknown, idx: number) => {
                        const e = exp as {
                          title?: string;
                          position?: string;
                          company?: string;
                          duration?: string;
                        };
                        return (
                          <div
                            key={idx}
                            className="p-3 bg-white rounded-lg border border-amber-200"
                          >
                            <p className="font-medium text-gray-900">
                              {e.title || e.position || 'Position'}
                            </p>
                            {e.company && (
                              <p className="text-sm text-gray-600">{e.company}</p>
                            )}
                            {e.duration && (
                              <p className="text-xs text-gray-500 mt-1">{e.duration}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-gradient-to-br from-secondary-50 to-white rounded-xl p-5 border border-secondary-100">
                <div className="flex items-center gap-2 mb-4">
                  <GraduationCap className="w-5 h-5 text-secondary-600" />
                  <h4 className="text-lg font-bold text-gray-900">
                    {COPY.LABELS.EDUCATION}
                  </h4>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-secondary-100 rounded-lg flex items-center justify-center">
                      <GraduationCap className="w-5 h-5 text-secondary-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">
                        {(resume.education || []).length} Institution
                        {(resume.education || []).length !== 1 ? 's' : ''}
                      </p>
                      <p className="text-sm text-gray-500">Education entries</p>
                    </div>
                  </div>
                  {(resume.education || []).length > 0 && (
                    <div className="mt-4 space-y-2">
                      {(resume.education || []).slice(0, 3).map((edu: unknown, idx: number) => {
                        const e = edu as {
                          institution?: string;
                          school?: string;
                          degree?: string;
                          year?: string;
                        };
                        return (
                          <div
                            key={idx}
                            className="p-3 bg-white rounded-lg border border-secondary-200"
                          >
                            <p className="font-medium text-gray-900">
                              {e.institution || e.school || 'Institution'}
                            </p>
                            {e.degree && (
                              <p className="text-sm text-gray-600">{e.degree}</p>
                            )}
                            {e.year && (
                              <p className="text-xs text-gray-500 mt-1">{e.year}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">{COPY.LABELS.CREATED}</p>
                    <p className="text-sm font-medium text-gray-900">
                      {resume.created_at
                        ? new Date(resume.created_at).toLocaleDateString()
                        : '-'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4" />
                  <div>
                    <p className="text-xs text-gray-500">{COPY.LABELS.STATUS}</p>
                    <p className="text-sm font-medium text-gray-900 capitalize">
                      {resume.status || '-'}
                    </p>
                  </div>
                </div>
                {resume.file_size != null && (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4" />
                    <div>
                      <p className="text-xs text-gray-500">{COPY.LABELS.FILE_SIZE}</p>
                      <p className="text-sm font-medium text-gray-900">
                        {(resume.file_size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </div>
                )}
                {resume.mime_type && (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4" />
                    <div>
                      <p className="text-xs text-gray-500">{COPY.LABELS.TYPE}</p>
                      <p className="text-sm font-medium text-gray-900">
                        {resume.mime_type}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-gray-50 px-6 py-4 flex justify-between items-center">
            <div />
            <div className="flex gap-3">
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary flex items-center gap-2 text-primary-700 hover:text-primary-800"
              >
                <FileText className="w-4 h-4" />
                {COPY.LABELS.VIEW_ORIGINAL}
              </a>
              <button onClick={onClose} className="btn btn-primary">
                {COPY.LABELS.CLOSE}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
