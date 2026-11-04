import { UserManager, WebStorageStateStore, type User } from 'oidc-client-ts';

/** Paths the IdP redirects back to. Both must be registered as redirect URIs on the OIDC client. */
export const AUTH_PATHS = {
  CALLBACK: '/auth/callback',
  SILENT_RENEW: '/auth/silent-renew',
} as const;

export interface OidcSettings {
  authority: string;
  clientId: string;
  scope: string;
  /** Some IdPs (e.g. Auth0) need the API identifier as an `audience` authorize parameter. */
  audience?: string;
}

/** Build-time settings (VITE_OIDC_*). Auth is off when authority or client id is missing (local dev). */
export function readOidcSettings(env: ImportMetaEnv = import.meta.env): OidcSettings | null {
  const authority = env.VITE_OIDC_AUTHORITY?.trim();
  const clientId = env.VITE_OIDC_CLIENT_ID?.trim();
  if (!authority || !clientId) return null;
  return {
    authority,
    clientId,
    scope: env.VITE_OIDC_SCOPE?.trim() || 'openid profile email',
    audience: env.VITE_OIDC_AUDIENCE?.trim() || undefined,
  };
}

export function createUserManager(
  settings: OidcSettings,
  origin = window.location.origin
): UserManager {
  return new UserManager({
    authority: settings.authority,
    client_id: settings.clientId,
    // Authorization Code flow; oidc-client-ts always uses PKCE (S256) for it. No client secret in the browser.
    response_type: 'code',
    scope: settings.scope,
    redirect_uri: `${origin}${AUTH_PATHS.CALLBACK}`,
    silent_redirect_uri: `${origin}${AUTH_PATHS.SILENT_RENEW}`,
    post_logout_redirect_uri: origin,
    automaticSilentRenew: true,
    // Tokens live in sessionStorage: scoped to this tab and cleared when it closes (not localStorage).
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
    extraQueryParams: settings.audience ? { audience: settings.audience } : undefined,
  });
}

const settings = readOidcSettings();

/** Shared UserManager, or null when authentication is not configured. */
export const userManager: UserManager | null = settings ? createUserManager(settings) : null;

export const authEnabled = userManager !== null;

function usable(user: User | null): user is User {
  return Boolean(user && !user.expired && user.access_token);
}

/** Current access token, or null when signed out / expired / auth disabled. */
export async function getAccessToken(
  manager: UserManager | null = userManager
): Promise<string | null> {
  if (!manager) return null;
  const user = await manager.getUser();
  return usable(user) ? user.access_token : null;
}

/**
 * Only same-origin, path-absolute return targets are honoured after login, so the `state` round-trip
 * can't be turned into an open redirect (e.g. `//evil.example` or `https://evil.example`).
 */
export function safeReturnPath(candidate: unknown): string {
  if (typeof candidate !== 'string' || !candidate.startsWith('/') || candidate.startsWith('//'))
    return '/';
  if (candidate.startsWith('/\\') || candidate.startsWith(AUTH_PATHS.CALLBACK)) return '/';
  return candidate;
}

let redirecting = false;

/** Starts the login redirect, remembering where the user was. Repeated calls while redirecting are ignored. */
export async function signIn(manager: UserManager | null = userManager): Promise<void> {
  if (!manager || redirecting) return;
  redirecting = true;
  const { pathname, search, hash } = window.location;
  try {
    await manager.signinRedirect({
      state: { returnTo: safeReturnPath(`${pathname}${search}${hash}`) },
    });
  } finally {
    redirecting = false;
  }
}

export async function signOut(manager: UserManager | null = userManager): Promise<void> {
  if (!manager) return;
  await manager.removeUser();
  await manager.signoutRedirect();
}
