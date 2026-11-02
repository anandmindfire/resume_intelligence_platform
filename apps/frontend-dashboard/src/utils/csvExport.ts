import { Resume } from '../types';
import { COPY } from '../constants';

export function exportResumesToCSV(resumes: Resume[], filename: string = 'resumes.csv') {
  if (resumes.length === 0) {
    alert(COPY.EXPORT.NO_RESUMES);
    return;
  }

  const headers = [
    'ID',
    'File Name',
    'Name',
    'Email',
    'Phone',
    'Skills',
    'Experience Count',
    'Education Count',
    'Status',
    'Created At',
  ];

  const rows = resumes.map((resume) => [
    resume.id,
    resume.file_name || '',
    resume.name || '',
    resume.email || '',
    resume.phone || '',
    (resume.skills || []).join('; '),
    (resume.experience || []).length.toString(),
    (resume.education || []).length.toString(),
    resume.status || '',
    resume.created_at ? new Date(resume.created_at).toISOString() : '',
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map((row) =>
      row.map((cell) => {
        const cellStr = String(cell || '');
        // Escape quotes and wrap in quotes if contains comma, quote, or newline
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      }).join(',')
    ),
  ].join('\n');

  // Add BOM for Excel compatibility
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
