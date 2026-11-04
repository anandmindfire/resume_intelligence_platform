/**
 * Capacity test: ramp up until error rate or p95 latency exceeds threshold.
 * Use results to size upload-service replicas: target_RPS = (replicas * RPS_per_replica).
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { buildSinglePart, authHeaders } from './multipart.js';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const uploadDuration = new Trend('upload_duration');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const UPLOAD_PATH = `${BASE_URL}/api/upload/single`;

// 100 VUs: ramp to 100 and hold. Scale upload-service replicas for best throughput and ~100% success.
export const options = {
  stages: [
    { duration: '1m', target: 20 },
    { duration: '1m', target: 40 },
    { duration: '1m', target: 60 },
    { duration: '1m', target: 80 },
    { duration: '1m', target: 100 },
    { duration: '2m', target: 100 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<30000'],
    upload_duration: ['p(95)<30000'],
  },
};

export default function () {
  const { body, boundary } = buildSinglePart(
    'resume.pdf',
    '%PDF-1.4\n% dummy pdf content for load test',
    'application/pdf'
  );
  const params = {
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, ...authHeaders() },
    timeout: '60s',
  };

  const start = Date.now();
  const res = http.post(UPLOAD_PATH, body, params);
  uploadDuration.add(Date.now() - start);

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
  if (!ok) errorRate.add(1);
  else errorRate.add(0);

  sleep(0.5);
}
