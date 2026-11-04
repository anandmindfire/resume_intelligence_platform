import axios from 'axios';
import type { GatewayRouteConfig } from '../types';

export interface OpenApiDocument {
  openapi?: string;
  info?: Record<string, unknown>;
  servers?: unknown[];
  tags?: Array<{ name: string; [key: string]: unknown }>;
  paths?: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
}

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

function upstreamPrefix(route: GatewayRouteConfig): string {
  return route.rewritePrefix ?? route.prefix;
}

function isUnderPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/**
 * Re-publish an upstream service's OpenAPI spec with the paths clients use through the gateway.
 *
 * Each upstream path is mapped through the route with the longest matching rewritePrefix
 * (e.g. /api/v1/jobs/{id} -> /api/jobs/{id} rather than /api/analytics/jobs/{id}). Paths the
 * gateway does not proxy (health checks, internal endpoints) are dropped, along with tags that
 * no longer have operations. Servers are removed so Swagger UI calls the gateway's own origin.
 */
export function rewriteSpecForGateway(
  spec: OpenApiDocument,
  routes: GatewayRouteConfig[]
): OpenApiDocument {
  const byLongestPrefix = [...routes].sort(
    (a, b) => upstreamPrefix(b).length - upstreamPrefix(a).length
  );

  const paths: Record<string, Record<string, unknown>> = {};
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    const route = byLongestPrefix.find((r) => isUnderPrefix(path, upstreamPrefix(r)));
    if (!route) continue;
    paths[route.prefix + path.slice(upstreamPrefix(route).length)] = item;
  }

  const usedTags = new Set<string>();
  for (const item of Object.values(paths)) {
    for (const method of HTTP_METHODS) {
      const operation = item[method] as { tags?: string[] } | undefined;
      operation?.tags?.forEach((tag) => usedTags.add(tag));
    }
  }

  const { servers: _servers, ...rest } = spec;
  return {
    ...rest,
    ...(spec.tags && { tags: spec.tags.filter((tag) => usedTags.has(tag.name)) }),
    paths,
  };
}

/** Fetch an upstream service's spec (served by @fastify/swagger at /docs/json). */
export async function fetchServiceSpec(
  upstream: string,
  timeout: number = 5000
): Promise<OpenApiDocument> {
  const response = await axios.get<OpenApiDocument>(`${upstream}/docs/json`, { timeout });
  return response.data;
}
