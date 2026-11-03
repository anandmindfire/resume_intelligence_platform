/** Gateway API version, reported in the OpenAPI spec and the /api, /api/v1 info endpoints. */
export const API_VERSION = '1.0.0';

/** Route path prefixes owned directly by the gateway (as opposed to the proxied upstream prefixes). */
export const ROUTES = {
  API_V1: '/api/v1',
  API_LEGACY: '/api',
  HEALTH: '/health',
} as const;

/** Upstream proxy limits. Per-route response timeouts live in config/gatewayConfig.ts. */
export const PROXY = {
  /** Applied when a route doesn't set its own `timeout`. */
  DEFAULT_RESPONSE_TIMEOUT_MS: 10_000,
  /** Opening a connection to an upstream that's up takes milliseconds; anything slower means it's down. */
  CONNECT_TIMEOUT_MS: 3_000,
} as const;
