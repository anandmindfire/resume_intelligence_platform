import Fastify, { type FastifyInstance } from 'fastify';
import { config } from '@resume-platform/config';
import { generateRequestId } from './requestId';
import { registerAccessLog, registerRequestContext } from './hooks';

export interface BaseAppOptions {
  /** Defaults to config.http.trustProxy (TRUST_PROXY). */
  trustProxy?: boolean | number | string | string[];
}

/**
 * Fastify instance with the cross-cutting behaviour every HTTP service shares, registered before any
 * plugin or route so it also covers requests they reject:
 *  - request correlation (`x-request-id` accepted, validated, echoed)
 *  - structured access logging
 *  - `trustProxy`, so `request.ip` (and per-IP rate limiting) reflects the real client behind proxies
 */
export function createBaseApp(options: BaseAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: false, // services log through @resume-platform/logger
    trustProxy: options.trustProxy ?? config.http.trustProxy,
    requestIdHeader: false, // ids come from generateRequestId, which validates them
    genReqId: generateRequestId,
  });

  registerRequestContext(app);
  registerAccessLog(app);

  return app;
}
