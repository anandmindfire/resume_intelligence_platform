import React, { useEffect, useState } from 'react';
import { Loading } from '../components/loading';
import {
  AUTH_PATHS,
  authEnabled,
  getAccessToken,
  safeReturnPath,
  signIn,
  userManager,
} from './oidc';

type GateState = 'checking' | 'ready' | 'error';

/**
 * Renders the app only for a signed-in user (when OIDC is configured). Handles the redirect back from
 * the IdP, restores the page the user started on, and otherwise starts the login redirect.
 * Must wrap the router: on the callback it rewrites the URL before any route is matched.
 */
export const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<GateState>(authEnabled ? 'checking' : 'ready');

  useEffect(() => {
    if (!userManager) return;
    let cancelled = false;

    (async () => {
      try {
        if (window.location.pathname === AUTH_PATHS.CALLBACK) {
          const user = await userManager.signinRedirectCallback();
          const returnTo = safeReturnPath(
            (user.state as { returnTo?: unknown } | undefined)?.returnTo
          );
          // Drop ?code=&state= from the address bar and history.
          window.history.replaceState(null, '', returnTo);
          if (!cancelled) setState('ready');
          return;
        }
        if (await getAccessToken()) {
          if (!cancelled) setState('ready');
          return;
        }
        await signIn();
      } catch {
        if (!cancelled) setState('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (state === 'ready') return <>{children}</>;
  if (state === 'error') {
    return (
      <div
        role="alert"
        className="min-h-screen flex flex-col items-center justify-center gap-4 text-white"
      >
        <p className="text-xl font-semibold">Sign-in failed.</p>
        <button
          type="button"
          onClick={() => {
            window.history.replaceState(null, '', '/');
            void signIn();
          }}
          className="px-6 py-2 bg-white text-primary-700 rounded-lg font-semibold"
        >
          Try again
        </button>
      </div>
    );
  }
  return <Loading />;
};
