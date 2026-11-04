/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** OIDC issuer URL. Login is required when this and VITE_OIDC_CLIENT_ID are set at build time. */
  readonly VITE_OIDC_AUTHORITY?: string;
  /** Public (secret-less) OIDC client id registered for this SPA. */
  readonly VITE_OIDC_CLIENT_ID?: string;
  /** Requested scopes (default "openid profile email"); include the API scope if the gateway requires one. */
  readonly VITE_OIDC_SCOPE?: string;
  /** Optional `audience` authorize parameter (Auth0-style IdPs). */
  readonly VITE_OIDC_AUDIENCE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
