/**
 * Inline multipart/form-data builder for k6 (no external jslib required).
 * Use in Docker and offline; no fetch of jslib.k6.io.
 */

function randomBoundary() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '----k6';
  for (let i = 0; i < 24; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/**
 * Build multipart body for a single file (field name "resume").
 * @param {string} filename - e.g. "resume.pdf"
 * @param {string} content - file body
 * @param {string} contentType - e.g. "application/pdf"
 * @returns {{ body: string, boundary: string }}
 */
export function buildSinglePart(filename, content, contentType) {
  const boundary = randomBoundary();
  const body = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="resume"; filename="${filename}"`,
    `Content-Type: ${contentType}`,
    '',
    content,
    `--${boundary}--`,
    '',
  ].join('\r\n');
  return { body, boundary };
}

/**
 * Build multipart body for multiple files (field name "resumes").
 * @param {Array<{ filename: string, content: string, contentType: string }>} files
 * @returns {{ body: string, boundary: string }}
 */
export function buildMultiPart(files) {
  const boundary = randomBoundary();
  const parts = files.map((f) =>
    [
      `--${boundary}`,
      `Content-Disposition: form-data; name="resumes"; filename="${f.filename}"`,
      `Content-Type: ${f.contentType}`,
      '',
      f.content,
    ].join('\r\n')
  );
  const body = parts.join('\r\n') + `\r\n--${boundary}--\r\n`;
  return { body, boundary };
}

/**
 * Authorization header for gateways that require OIDC tokens: pass a valid access token with
 * `-e ACCESS_TOKEN=...` (e.g. from your IdP's client-credentials flow). Empty when unset.
 * @returns {Record<string, string>}
 */
export function authHeaders() {
  return __ENV.ACCESS_TOKEN ? { Authorization: `Bearer ${__ENV.ACCESS_TOKEN}` } : {};
}
