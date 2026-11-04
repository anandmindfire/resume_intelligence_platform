import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { manager, oidc } = vi.hoisted(() => {
  const manager = { signinRedirectCallback: vi.fn() };
  const oidc = { getAccessToken: vi.fn(), signIn: vi.fn() };
  return { manager, oidc };
});

vi.mock('./oidc', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./oidc')>();
  return {
    ...actual,
    authEnabled: true,
    userManager: manager,
    getAccessToken: oidc.getAccessToken,
    signIn: oidc.signIn,
  };
});

import { AuthGate } from './AuthGate';

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('AuthGate', () => {
  it('renders the app for a signed-in user', async () => {
    oidc.getAccessToken.mockResolvedValue('tok');
    render(<AuthGate>secret dashboard</AuthGate>);
    expect(await screen.findByText('secret dashboard')).toBeInTheDocument();
    expect(oidc.signIn).not.toHaveBeenCalled();
  });

  it('starts the login redirect and never renders the app for an anonymous user', async () => {
    oidc.getAccessToken.mockResolvedValue(null);
    render(<AuthGate>secret dashboard</AuthGate>);
    await waitFor(() => expect(oidc.signIn).toHaveBeenCalled());
    expect(screen.queryByText('secret dashboard')).not.toBeInTheDocument();
  });

  it('completes the IdP callback and returns to the original page, stripping code/state', async () => {
    window.history.replaceState(null, '', '/auth/callback?code=abc&state=xyz');
    manager.signinRedirectCallback.mockResolvedValue({ state: { returnTo: '/resumes?page=2' } });
    render(<AuthGate>secret dashboard</AuthGate>);
    expect(await screen.findByText('secret dashboard')).toBeInTheDocument();
    expect(window.location.pathname + window.location.search).toBe('/resumes?page=2');
  });

  it('ignores an off-site return target from the callback state', async () => {
    window.history.replaceState(null, '', '/auth/callback?code=abc&state=xyz');
    manager.signinRedirectCallback.mockResolvedValue({ state: { returnTo: '//evil.example' } });
    render(<AuthGate>secret dashboard</AuthGate>);
    await screen.findByText('secret dashboard');
    expect(window.location.pathname).toBe('/');
  });

  it('shows a retry when the callback fails', async () => {
    window.history.replaceState(null, '', '/auth/callback?code=bad&state=bad');
    manager.signinRedirectCallback.mockRejectedValue(new Error('invalid_grant'));
    render(<AuthGate>secret dashboard</AuthGate>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign-in failed');
    expect(screen.queryByText('secret dashboard')).not.toBeInTheDocument();
  });
});
