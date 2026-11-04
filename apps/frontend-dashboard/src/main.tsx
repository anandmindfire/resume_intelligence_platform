import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { AUTH_PATHS, userManager } from './auth/oidc';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in index.html');
}

// Hidden iframe used by oidc-client-ts to renew tokens: finish the renewal, don't boot the app in it.
if (userManager && window.location.pathname === AUTH_PATHS.SILENT_RENEW) {
  void userManager.signinSilentCallback();
} else {
  renderApp(rootElement);
}

function renderApp(root: HTMLElement) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
