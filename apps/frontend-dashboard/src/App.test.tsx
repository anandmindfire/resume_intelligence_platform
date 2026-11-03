import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./pages/Analytics', () => ({ Analytics: () => <div>Analytics page</div> }));
vi.mock('./pages/Upload', () => ({ Upload: () => <div>Upload page</div> }));
vi.mock('./pages/Resumes', () => ({ Resumes: () => <div>Resumes page</div> }));
vi.mock('./pages/Jobs', () => ({ Jobs: () => <div>Jobs page</div> }));

import App from './App';

function renderAt(path: string) {
  window.history.pushState({}, '', path);
  return render(<App />);
}

describe('App routing', () => {
  afterEach(() => window.history.pushState({}, '', '/'));

  it.each([
    ['/', 'Analytics page'],
    ['/upload', 'Upload page'],
    ['/resumes', 'Resumes page'],
    ['/jobs', 'Jobs page'],
  ])('renders the page for %s inside the layout', async (path, text) => {
    renderAt(path);
    await waitFor(() => expect(screen.getByText(text)).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Resume Intelligence' })).toBeInTheDocument();
  });

  it('redirects /analytics to /', async () => {
    renderAt('/analytics');
    await waitFor(() => expect(screen.getByText('Analytics page')).toBeInTheDocument());
    expect(window.location.pathname).toBe('/');
  });

  it('renders only the layout for unknown routes', async () => {
    renderAt('/nope');
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Resume Intelligence' })).toBeInTheDocument()
    );
    expect(screen.queryByText(/page$/)).not.toBeInTheDocument();
  });
});
