/**
 * Batch upload load test: multiple files per request.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { buildMultiPart, authHeaders } from './multipart.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const BATCH_PATH = `${BASE_URL}/api/upload/multiple`;
const FILES_PER_REQUEST = parseInt(__ENV.FILES_PER_REQUEST || '5', 10);

export const options = {
  stages: [
    { duration: '1m', target: 10 },
    { duration: '2m', target: 20 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<15000'],
    http_req_failed: ['rate<0.1'],
  },
};

export default function () {
  const dummyPdf = '%PDF-1.4\n% dummy pdf content for batch load test';
  const files = [];
  for (let i = 0; i < FILES_PER_REQUEST; i++) {
    files.push({
      filename: `resume-${i}.pdf`,
      content: dummyPdf,
      contentType: 'application/pdf',
    });
  }
  const { body, boundary } = buildMultiPart(files);
  const params = {
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, ...authHeaders() },
    timeout: '90s',
  };

  const res = http.post(BATCH_PATH, body, params);

  check(res, {
    'status 201': (r) => r.status === 201,
    'has results': (r) => {
      try {
        const data = JSON.parse(r.body);
        return data.results && Array.isArray(data.results);
      } catch {
        return false;
      }
    },
  });

  sleep(1);
}
