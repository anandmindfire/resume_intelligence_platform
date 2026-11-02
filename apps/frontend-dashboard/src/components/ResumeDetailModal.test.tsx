import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ResumeDetailModal } from './ResumeDetailModal';
import { makeResume } from '../test/fixtures';
import { COPY } from '../constants';

describe('ResumeDetailModal', () => {
  it('renders nothing without a resume', () => {
    const { container } = render(<ResumeDetailModal resume={null} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders contact information, skills, experience and education', () => {
    render(
      <ResumeDetailModal
        resume={makeResume({
          location: 'Berlin',
          experience: [
            { title: 'Engineer', company: 'Acme', duration: '2 years' },
            { position: 'Intern' },
          ],
          education: [{ institution: 'MIT', degree: 'BSc', year: '2018' }, { school: 'High School' }],
        })}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByRole('heading', { name: 'jane_doe.pdf' })).toBeInTheDocument();
    expect(screen.getByText(COPY.LABELS.RESUME_DETAILS)).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
    expect(screen.getByText('555-0100')).toBeInTheDocument();
    expect(screen.getByText('Berlin')).toBeInTheDocument();
    expect(screen.getByText('React')).toBeInTheDocument();
    expect(screen.getByText('TypeScript')).toBeInTheDocument();

    expect(screen.getByText('2 Positions')).toBeInTheDocument();
    expect(screen.getByText('Engineer')).toBeInTheDocument();
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('2 years')).toBeInTheDocument();
    expect(screen.getByText('Intern')).toBeInTheDocument();

    expect(screen.getByText('2 Institutions')).toBeInTheDocument();
    expect(screen.getByText('MIT')).toBeInTheDocument();
    expect(screen.getByText('BSc')).toBeInTheDocument();
    expect(screen.getByText('2018')).toBeInTheDocument();
    expect(screen.getByText('High School')).toBeInTheDocument();
    expect(screen.getByText('completed')).toBeInTheDocument();
  });

  it('shows placeholders and fallbacks for sparse data', () => {
    render(
      <ResumeDetailModal
        resume={makeResume({
          name: undefined,
          email: undefined,
          phone: undefined,
          location: undefined,
          skills: [],
          experience: [{}],
          education: [{}],
          created_at: undefined,
          status: '',
        })}
        onClose={vi.fn()}
      />
    );
    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(5);
    expect(screen.getByText('No skills listed')).toBeInTheDocument();
    expect(screen.getByText('1 Position')).toBeInTheDocument();
    expect(screen.getByText('Position')).toBeInTheDocument();
    expect(screen.getByText('1 Institution')).toBeInTheDocument();
    expect(screen.getByText('Institution')).toBeInTheDocument();
    expect(screen.queryByText(COPY.LABELS.LOCATION)).not.toBeInTheDocument();
    expect(screen.queryByText(COPY.LABELS.FILE_SIZE)).not.toBeInTheDocument();
    expect(screen.queryByText(COPY.LABELS.TYPE)).not.toBeInTheDocument();
  });

  it('handles missing skills/experience/education arrays', () => {
    render(
      <ResumeDetailModal
        resume={makeResume({ skills: undefined, experience: undefined, education: undefined })}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('No skills listed')).toBeInTheDocument();
    expect(screen.getByText('0 Positions')).toBeInTheDocument();
    expect(screen.getByText('0 Institutions')).toBeInTheDocument();
  });

  it('shows only the first three experience and education entries', () => {
    render(
      <ResumeDetailModal
        resume={makeResume({
          experience: ['a', 'b', 'c', 'd'].map((t) => ({ title: `Job ${t}` })),
          education: ['a', 'b', 'c', 'd'].map((t) => ({ institution: `Uni ${t}` })),
        })}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('4 Positions')).toBeInTheDocument();
    expect(screen.getByText('Job c')).toBeInTheDocument();
    expect(screen.queryByText('Job d')).not.toBeInTheDocument();
    expect(screen.getByText('Uni c')).toBeInTheDocument();
    expect(screen.queryByText('Uni d')).not.toBeInTheDocument();
  });

  it('shows file metadata when available', () => {
    render(
      <ResumeDetailModal
        resume={makeResume({ file_size: 2048, mime_type: 'application/pdf' })}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('2.0 KB')).toBeInTheDocument();
    expect(screen.getByText('application/pdf')).toBeInTheDocument();
    expect(
      screen.getByText(new Date('2024-03-15T10:00:00.000Z').toLocaleDateString())
    ).toBeInTheDocument();
  });

  it('links to the original file with the default URL builder', () => {
    render(<ResumeDetailModal resume={makeResume({ id: 'abc' })} onClose={vi.fn()} />);
    const link = screen.getByRole('link', { name: COPY.LABELS.VIEW_ORIGINAL });
    expect(link).toHaveAttribute('href', '/api/upload/resumes/abc/file');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('uses a custom getResumeFileUrl', () => {
    const getUrl = vi.fn(() => 'https://files/x');
    render(<ResumeDetailModal resume={makeResume({ id: 'abc' })} onClose={vi.fn()} getResumeFileUrl={getUrl} />);
    expect(getUrl).toHaveBeenCalledWith('abc');
    expect(screen.getByRole('link', { name: COPY.LABELS.VIEW_ORIGINAL })).toHaveAttribute('href', 'https://files/x');
  });

  it('calls onClose from the header button, footer button and backdrop', () => {
    const onClose = vi.fn();
    const { container } = render(<ResumeDetailModal resume={makeResume()} onClose={onClose} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]); // header X
    fireEvent.click(screen.getByRole('button', { name: COPY.LABELS.CLOSE }));
    fireEvent.click(container.querySelector('.bg-opacity-75') as Element);
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
