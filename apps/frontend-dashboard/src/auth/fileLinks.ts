import type React from 'react';
import { authEnabled } from './oidc';
import { openResumeFile } from '../services/apiClient';

/**
 * onClick for "view/download original" links. Without auth the link navigates normally; with auth the
 * navigation is replaced by an authenticated fetch (a link can't send the bearer token).
 */
export function handleResumeFileClick(
  event: React.MouseEvent,
  resumeId: string,
  fileName?: string
): void {
  if (!authEnabled) return;
  event.preventDefault();
  void openResumeFile(resumeId, fileName).catch(() => {
    // 401 is handled by the API client (re-login); other failures leave the page as it is.
  });
}
