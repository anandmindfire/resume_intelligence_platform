import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { Layout } from './Layout';
import { COPY } from '../constants';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Layout>
        <p>Page body</p>
      </Layout>
    </MemoryRouter>
  );
}

const ACTIVE = 'from-primary-500';

describe('Layout', () => {
  it('renders the app name, children and desktop nav links', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { name: COPY.APP_NAME })).toBeInTheDocument();
    expect(screen.getByText('Page body')).toBeInTheDocument();
    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Analytics', 'Upload', 'Resumes', 'Jobs']);
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/', '/upload', '/resumes', '/jobs']);
  });

  it.each([
    ['/', 'Analytics'],
    ['/upload', 'Upload'],
    ['/resumes', 'Resumes'],
    ['/jobs', 'Jobs'],
  ])('highlights the active link at %s', (path, active) => {
    renderAt(path);
    screen.getAllByRole('link').forEach((link) => {
      if (link.textContent === active) expect(link).toHaveClass(ACTIVE);
      else expect(link).not.toHaveClass(ACTIVE);
    });
  });

  it('toggles the mobile menu and closes it when a link is chosen', () => {
    const { container } = renderAt('/');
    const toggle = screen.getByRole('button');
    expect(screen.getAllByRole('link')).toHaveLength(4);

    fireEvent.click(toggle);
    const mobileMenu = container.querySelector('.animate-slide-up') as HTMLElement;
    expect(mobileMenu).not.toBeNull();
    const mobileLinks = within(mobileMenu).getAllByRole('link');
    expect(mobileLinks.map((l) => l.textContent)).toEqual(['Analytics', 'Upload', 'Resumes', 'Jobs']);
    expect(mobileLinks[0]).toHaveClass(ACTIVE);
    expect(mobileLinks[1]).not.toHaveClass(ACTIVE);

    fireEvent.click(mobileLinks[3]);
    expect(container.querySelector('.animate-slide-up')).toBeNull();
    // navigating highlighted the Jobs desktop link
    expect(screen.getByRole('link', { name: 'Jobs' })).toHaveClass(ACTIVE);
  });

  it.each([0, 1, 2])('closes the mobile menu via link %i', (index) => {
    const { container } = renderAt('/jobs');
    fireEvent.click(screen.getByRole('button'));
    const mobileMenu = container.querySelector('.animate-slide-up') as HTMLElement;
    fireEvent.click(within(mobileMenu).getAllByRole('link')[index]);
    expect(container.querySelector('.animate-slide-up')).toBeNull();
  });

  it('closes the mobile menu when the toggle is clicked again', () => {
    const { container } = renderAt('/');
    const toggle = screen.getByRole('button');
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(container.querySelector('.animate-slide-up')).toBeNull();
  });
});
