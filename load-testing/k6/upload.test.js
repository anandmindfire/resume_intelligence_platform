import http from 'k6/http';
import { check, sleep } from 'k6';
import { buildSinglePart, authHeaders } from './multipart.js';

// 100 VUs: ramp to 100 and hold. Scale upload-service replicas until you get ~100% success.
export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 10 },
    { duration: '30s', target: 50 },
    { duration: '2m', target: 50 },
    { duration: '30s', target: 100 },
    { duration: '2m', target: 100 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<30000'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  const { body, boundary } = buildSinglePart(
    'test-resume.pdf',
    '%PDF-1.4\n% dummy pdf content',
    'application/pdf'
  );
  const params = {
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, ...authHeaders() },
  };

  const res = http.post(`${BASE_URL}/api/upload/single`, body, params);

  check(res, {
    'upload status is 201': (r) => r.status === 201,
    'response has resumeId': (r) => {
      try {
        return JSON.parse(r.body).resumeId !== undefined;
      } catch {
        return false;
      }
    },
  });

  sleep(1);
}
