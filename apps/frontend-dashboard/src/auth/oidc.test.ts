import { describe, expect, it, vi } from 'vitest';
import type { UserManager } from 'oidc-client-ts';
import {
  AUTH_PATHS,
  createUserManager,
  getAccessToken,
  readOidcSettings,
  safeReturnPath,
} from './oidc';

describe('readOidcSettings', () => {
  it('disables auth unless both authority and client id are set', () => {
    expect(readOidcSettings({} as ImportMetaEnv)).toBeNull();
    expect(
      readOidcSettings({ VITE_OIDC_AUTHORITY: 'https://idp.test' } as ImportMetaEnv)
    ).toBeNull();
    expect(readOidcSettings({ VITE_OIDC_CLIENT_ID: 'spa' } as ImportMetaEnv)).toBeNull();
  });

  it('reads settings with a default scope', () => {
    expect(
      readOidcSettings({
        VITE_OIDC_AUTHORITY: ' https://idp.test ',
        VITE_OIDC_CLIENT_ID: 'spa',
      } as ImportMetaEnv)
    ).toEqual({
      authority: 'https://idp.test',
      clientId: 'spa',
      scope: 'openid profile email',
      audience: undefined,
    });
  });
});

describe('createUserManager', () => {
  it('uses the authorization code flow with same-origin redirect URIs and session storage', () => {
    const manager = createUserManager(
      {
        authority: 'https://idp.test',
        clientId: 'spa',
        scope: 'openid resumes',
        audience: 'resume-api',
      },
      'https://app.test'
    );
    const s = manager.settings;
    expect(s.response_type).toBe('code');
    expect(s.redirect_uri).toBe(`https://app.test${AUTH_PATHS.CALLBACK}`);
    expect(s.silent_redirect_uri).toBe(`https://app.test${AUTH_PATHS.SILENT_RENEW}`);
    expect(s.scope).toBe('openid resumes');
    expect(s.extraQueryParams).toEqual({ audience: 'resume-api' });
    expect(s).not.toHaveProperty('client_secret', expect.anything());
  });
});

describe('safeReturnPath', () => {
  it.each([
    ['/resumes?page=2', '/resumes?page=2'],
    ['/', '/'],
    ['//evil.example/x', '/'],
    ['/\\evil.example', '/'],
    ['https://evil.example', '/'],
    ['javascript:alert(1)', '/'],
    [AUTH_PATHS.CALLBACK + '?code=x', '/'],
    [undefined, '/'],
    [42, '/'],
  ])('%s -> %s', (input, expected) => {
    expect(safeReturnPath(input)).toBe(expected);
  });
});

describe('getAccessToken', () => {
  const managerWith = (user: unknown) =>
    ({ getUser: vi.fn().mockResolvedValue(user) }) as unknown as UserManager;

  it('returns null when auth is disabled or nobody is signed in', async () => {
    await expect(getAccessToken(null)).resolves.toBeNull();
    await expect(getAccessToken(managerWith(null))).resolves.toBeNull();
  });

  it('returns null for an expired session', async () => {
    await expect(
      getAccessToken(managerWith({ expired: true, access_token: 't' }))
    ).resolves.toBeNull();
  });

  it('returns the access token of a live session', async () => {
    await expect(
      getAccessToken(managerWith({ expired: false, access_token: 'tok' }))
    ).resolves.toBe('tok');
  });
});
