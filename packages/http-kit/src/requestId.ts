import { randomUUID } from 'crypto';
import type { IncomingMessage } from 'http';

/** Header carrying the correlation id between the edge proxy, the gateway and every service behind it. */
export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Inbound ids are untrusted input that ends up in logs and response headers, so only plain,
 * bounded tokens are accepted (no whitespace, control characters, or anything that could forge log lines).
 */
const VALID_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

export function isValidRequestId(value: unknown): value is string {
  return typeof value === 'string' && VALID_REQUEST_ID.test(value);
}

/**
 * Fastify `genReqId`: keep a well-formed inbound x-request-id so a single id follows a request across
 * nginx -> gateway -> upstream service, otherwise mint a new one.
 */
export function generateRequestId(req: Pick<IncomingMessage, 'headers'>): string {
  const inbound = req.headers[REQUEST_ID_HEADER];
  return isValidRequestId(inbound) ? inbound : randomUUID();
}
