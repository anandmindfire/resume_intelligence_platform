export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface HealthCheckResponse {
  status: string;
  timestamp: string;
  services?: {
    upload?: string;
    analytics?: string;
  };
}

export interface GatewayConfig {
  rateLimit: {
    max: number;
    timeWindow: string;
  };
  cors: {
    origin: string | boolean;
  };
}

export interface GatewayRouteConfig {
  upstream: string;
  prefix: string;
  rewritePrefix?: string;
  timeout?: number;
}
