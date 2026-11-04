/**
 * Stress test: ramp to 100 VUs. Use after scaling upload-service replicas.
 * With single replica expect ~40–50% success; scale replicas for higher success.
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { buildSinglePart, authHeaders } from './multipart.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  stages: [
    { duration: '1m', target: 20 },
    { duration: '1m', target: 50 },
    { duration: '1m', target: 100 },
    { duration: '2m', target: 100 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<30000'],
  },
};

export default function () {
  const { body, boundary } = buildSinglePart(
    'resume.pdf',
    '%PDF-1.4\n% dummy pdf content for stress test',
    'application/pdf'
  );
  const res = http.post(`${BASE_URL}/api/upload/single`, body, {
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, ...authHeaders() },
    timeout: '60s',
  });

  check(res, {
    'status 201': (r) => r.status === 201,
    'has resumeId': (r) => {
      try {
        return JSON.parse(r.body).resumeId !== undefined;
      } catch {
        return false;
      }
    },
  });

  sleep(0.5);
}
