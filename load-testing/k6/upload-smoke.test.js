/**
 * Smoke test: 2 VUs, 10s. Use to verify the server accepts the multipart format
 * before running full load. If this fails, check gateway/upload-service logs for status codes.
 * Run: ./scripts/run-k6.sh load-testing/k6/upload-smoke.test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { buildSinglePart, authHeaders } from './multipart.js';

export const options = {
  vus: 2,
  duration: '10s',
  thresholds: {
    http_req_failed: ['rate<0.1'],
    http_req_duration: ['p(95)<5000'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  const { body, boundary } = buildSinglePart(
    'resume.pdf',
    '%PDF-1.4\n% dummy pdf content',
    'application/pdf'
  );
  const res = http.post(`${BASE_URL}/api/upload/single`, body, {
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, ...authHeaders() },
    timeout: '30s',
  });

  const ok = check(res, {
    'status 201': (r) => r.status === 201,
    'has resumeId': (r) => {
      try {
        return JSON.parse(r.body).resumeId !== undefined;
      } catch {
        return false;
      }
    },
  });

  if (!ok && res.status > 0) {
    console.warn(`Upload failed: status=${res.status} body=${res.body?.substring(0, 200)}`);
  }

  sleep(0.5);
}
