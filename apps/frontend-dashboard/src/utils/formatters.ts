export function formatDate(dateString?: string): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatSkills(skills?: string[]): string {
  if (!skills || skills.length === 0) return '-';
  if (skills.length <= 3) return skills.join(', ');
  return `${skills.slice(0, 3).join(', ')} +${skills.length - 3} more`;
}

/**
 * Normalises an API match score to a number in [0, 100].
 * All API scores are already on a 0-100 scale (analytics `match_score` may arrive
 * as a string such as "82.50"); this only parses and clamps, it never rescales.
 */
export function normalizeMatchScore(score?: number | string): number {
  if (score === undefined || score === null) return 0;
  const numScore = typeof score === 'string' ? parseFloat(score) : score;
  if (isNaN(numScore)) return 0;
  return Math.min(100, Math.max(0, numScore));
}

export function formatMatchScore(score?: number | string): string {
  if (score === undefined || score === null) return '-';
  const percentage = normalizeMatchScore(score);
  return `${percentage.toFixed(0)}%`;
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num);
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}
