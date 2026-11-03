import React, { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { uploadService } from '../services/uploadService';
import { Card, StatusBadge } from '../components/common';
import { ALLOWED_FILE_TYPES, COPY } from '../constants';
import { Upload as UploadIcon, File, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import type { UploadResult } from '../types';
import { summarizeUploadResults } from '../utils/uploadSummary';

export const Upload: React.FC = () => {
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);

  const onDrop = async (acceptedFiles: File[]) => {
    setUploading(true);
    setResults([]);

    const formData = new FormData();
    acceptedFiles.forEach((file) => formData.append('resumes', file));

    try {
      const response = await uploadService.uploadMultiple(formData);
      setResults(response.results ?? []);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      alert(`${COPY.ERRORS.UPLOAD_FAILED}: ${message}`);
      console.error('Upload failed:', error);
    } finally {
      setUploading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ALLOWED_FILE_TYPES,
    multiple: true,
  });

  const fileCount = results.length;
  const { successCount, failedCount } = summarizeUploadResults(results);

  return (
    <div className="animate-fade-in space-y-8">
      <div className="mb-8">
        <h1 className="text-5xl font-bold text-white mb-3 drop-shadow-lg">
          {COPY.PAGES.UPLOAD.TITLE}
        </h1>
        <p className="text-white/90 text-xl">{COPY.PAGES.UPLOAD.SUBTITLE}</p>
      </div>

      <Card title={COPY.UPLOAD.CARD_TITLE} description={COPY.UPLOAD.CARD_DESCRIPTION}>
        <div
          {...getRootProps()}
          className={`border-3 border-dashed rounded-2xl p-16 text-center cursor-pointer transition-all duration-300 ${
            isDragActive
              ? 'border-primary-500 bg-gradient-to-br from-primary-50 to-primary-100 scale-[1.02] shadow-lg'
              : 'border-neutral-300 bg-gradient-to-br from-neutral-50 to-white hover:border-primary-400 hover:bg-gradient-to-br hover:from-primary-50/50 hover:to-white hover:shadow-md'
          }`}
        >
          <input {...getInputProps({ 'aria-label': COPY.UPLOAD.CARD_DESCRIPTION })} />
          <div className="flex flex-col items-center gap-6">
            {isDragActive ? (
              <>
                <div className="relative">
                  <div className="absolute inset-0 bg-primary-200 rounded-full blur-xl opacity-50 animate-pulse" />
                  <UploadIcon className="w-20 h-20 text-primary-600 relative z-10 animate-bounce" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-primary-700 mb-2">
                    {COPY.UPLOAD.DROP_HERE}
                  </p>
                  <p className="text-sm text-primary-600">{COPY.UPLOAD.RELEASE}</p>
                </div>
              </>
            ) : (
              <>
                <div className="relative">
                  <div className="w-24 h-24 bg-gradient-to-br from-primary-100 to-primary-200 rounded-2xl flex items-center justify-center shadow-lg transform hover:scale-110 transition-transform duration-300">
                    <File className="w-12 h-12 text-primary-600" />
                  </div>
                  {!uploading && (
                    <div className="absolute -top-2 -right-2 w-8 h-8 bg-secondary-500 rounded-full flex items-center justify-center shadow-md">
                      <UploadIcon className="w-4 h-4 text-white" />
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-2xl font-bold text-neutral-800 mb-2">
                    {COPY.UPLOAD.DRAG_DROP}
                  </p>
                  <p className="text-base text-neutral-600 mb-4">
                    or{' '}
                    <span className="text-primary-600 font-semibold">
                      {COPY.UPLOAD.CLICK_BROWSE}
                    </span>
                  </p>
                  <div className="flex flex-wrap justify-center gap-2 mt-4">
                    {COPY.UPLOAD.FILE_FORMATS.map((fmt) => (
                      <span
                        key={fmt}
                        className="px-3 py-1 bg-primary-100 text-primary-700 rounded-full text-xs font-medium"
                      >
                        {fmt}
                      </span>
                    ))}
                  </div>
                  <p className="text-sm text-neutral-500 mt-4">{COPY.UPLOAD.MULTIPLE_SUPPORTED}</p>
                </div>
              </>
            )}
          </div>
        </div>

        {uploading && (
          <div
            className="mt-8 text-center py-12 bg-gradient-to-br from-primary-50 to-white rounded-2xl border-2 border-primary-200"
            role="status"
            aria-live="polite"
          >
            <div className="relative inline-block mb-6">
              <div className="absolute inset-0 bg-primary-200 rounded-full blur-2xl opacity-30 animate-pulse" />
              <Loader2 className="w-16 h-16 text-primary-600 relative z-10 animate-spin mx-auto" />
            </div>
            <p className="text-xl font-bold text-neutral-800 mb-2">{COPY.LOADING.UPLOADING}</p>
            <p className="text-sm text-neutral-600">{COPY.LOADING.UPLOADING_WAIT}</p>
            <div className="mt-6 w-full max-w-md mx-auto">
              <div className="h-2 bg-neutral-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary-500 to-primary-600 rounded-full animate-pulse"
                  style={{ width: '60%' }}
                />
              </div>
            </div>
          </div>
        )}

        {results.length > 0 && (
          <div className="mt-8 space-y-6" aria-live="polite">
            <div className="bg-gradient-to-r from-primary-50 via-secondary-50 to-primary-50 rounded-2xl p-6 border-2 border-primary-200 shadow-lg">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h3 className="text-2xl font-bold text-neutral-900 mb-1">
                    {COPY.UPLOAD.UPLOAD_SUMMARY}
                  </h3>
                  <p className="text-sm text-neutral-600">
                    {COPY.UPLOAD.FILES_PROCESSED(fileCount)}
                  </p>
                </div>
                <div className="flex gap-6">
                  <div className="text-center sm:text-right">
                    <div className="flex items-center gap-2 text-3xl font-bold text-secondary-600">
                      <CheckCircle className="w-7 h-7" />
                      {successCount}
                    </div>
                    <div className="text-xs text-neutral-600 mt-1 font-medium">
                      {COPY.UPLOAD.SUCCESSFUL}
                    </div>
                  </div>
                  {failedCount > 0 && (
                    <div className="text-center sm:text-right">
                      <div className="flex items-center gap-2 text-3xl font-bold text-danger-600">
                        <XCircle className="w-7 h-7" />
                        {failedCount}
                      </div>
                      <div className="text-xs text-neutral-600 mt-1 font-medium">
                        {COPY.UPLOAD.FAILED}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {results.map((result, index) => (
                <div
                  key={index}
                  className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 bg-white rounded-xl border border-neutral-200 hover:border-primary-300 hover:shadow-md transition-all duration-200"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-neutral-900 truncate">{result.fileName}</p>
                    {result.error && (
                      <p className="text-sm text-danger-600 mt-1" role="alert">
                        {result.error}
                      </p>
                    )}
                    {!result.error && result.status === 'uploaded' && (
                      <p className="text-sm text-secondary-600 mt-1">{COPY.UPLOAD.QUEUED}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <StatusBadge status={result.status} />
                    {result.resumeId && (
                      <code className="text-xs bg-primary-50 text-primary-700 px-3 py-1.5 rounded-lg font-mono border border-primary-200">
                        {result.resumeId.substring(0, 8)}...
                      </code>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};
