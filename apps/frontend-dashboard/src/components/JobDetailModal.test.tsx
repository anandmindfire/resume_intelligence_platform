import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { JobDetailModal } from './JobDetailModal';
import { makeJob, makeMatchDetail, makeResume } from '../test/fixtures';
import { COPY } from '../constants';
import type { JobDetailModalProps } from '../types';

function renderModal(overrides: Partial<JobDetailModalProps> = {}) {
  const props: JobDetailModalProps = {
    job: makeJob(),
    matchDetail: makeMatchDetail(),
    isOpen: true,
    onClose: vi.fn(),
    ...overrides,
  };
  return { ...render(<JobDetailModal {...props} />), props };
}

describe('JobDetailModal', () => {
  it('renders nothing when closed', () => {
    const { container } = renderModal({ isOpen: false });
    expect(container).toBeEmptyDOMElement();
  });

  it('renders job header and summary info', () => {
    renderModal();
    expect(screen.getByRole('heading', { level: 2, name: 'Frontend Developer' })).toBeInTheDocument();
    expect(screen.getByText('Web • JOB-1')).toBeInTheDocument();
    expect(screen.getByText('Remote')).toBeInTheDocument();
    expect(screen.getByText('2+ years')).toBeInTheDocument();
    expect(screen.getByText('2 resumes')).toBeInTheDocument();
  });

  it('shows the overall match score with colour coding', () => {
    renderModal({ matchDetail: makeMatchDetail({ matchScore: 0.8 }) });
    expect(screen.getByText(COPY.LABELS.OVERALL_MATCH_SCORE)).toBeInTheDocument();
    expect(screen.getByText('80%')).toHaveClass('text-green-600');
  });

  it.each([
    [0.55, 'text-yellow-600', 'bg-yellow-500'],
    [0.2, 'text-gray-400', 'bg-gray-400'],
  ])('colours score %s with %s', (score, textClass, barClass) => {
    const { container } = renderModal({
      matchDetail: makeMatchDetail({ matchScore: score, matchedResumes: [] }),
    });
    const label = `${Math.round(score * 100)}%`;
    expect(screen.getByText(label)).toHaveClass(textClass);
    const bar = container.querySelector(`.h-3.${barClass}`) as HTMLElement;
    expect(bar.style.width).toBe(`${score * 100}%`);
  });

  it('shows requirement satisfaction from the match detail', () => {
    const { container } = renderModal({
      matchDetail: makeMatchDetail({ requirementsMet: 3, requirementsTotal: 4 }),
    });
    expect(screen.getByText('3 of 4 requirements met (75%)')).toBeInTheDocument();
    expect((container.querySelector('.h-2.bg-green-500') as HTMLElement).style.width).toBe('75%');
  });

  it('uses medium / low colours for requirement satisfaction', () => {
    const medium = renderModal({ matchDetail: makeMatchDetail({ requirementsMet: 1, requirementsTotal: 2 }) });
    expect(medium.container.querySelector('.h-2.bg-yellow-500')).not.toBeNull();
    medium.unmount();
    const low = renderModal({ matchDetail: makeMatchDetail({ requirementsMet: 1, requirementsTotal: 4 }) });
    expect(low.container.querySelector('.h-2.bg-red-500')).not.toBeNull();
  });

  it('falls back to skills+1 requirements and hides score without match detail', () => {
    renderModal({ matchDetail: null });
    expect(screen.queryByText(COPY.LABELS.OVERALL_MATCH_SCORE)).not.toBeInTheDocument();
    expect(screen.getByText('0 of 4 requirements met (0%)')).toBeInTheDocument();
    expect(screen.getByText('0 resumes')).toBeInTheDocument();
    expect(screen.getByText(COPY.EMPTY.NO_MATCHES_FOR_JOB)).toBeInTheDocument();
  });

  it('handles a zero requirements total', () => {
    renderModal({ matchDetail: makeMatchDetail({ requirementsMet: 0, requirementsTotal: 0 }) });
    expect(screen.getByText('0 of 0 requirements met (0%)')).toBeInTheDocument();
  });

  it('marks required skills matched case-insensitively by any matched resume', () => {
    const { container } = renderModal();
    // fixture: resumes matched "react" and "TypeScript"; job requires React, TypeScript, CSS
    const skillRow = (name: string) => screen.getByText(name, { selector: 'span.text-green-900, span.text-red-900' }).parentElement;
    expect(skillRow('React')).toHaveClass('bg-green-50');
    expect(skillRow('TypeScript')).toHaveClass('bg-green-50');
    expect(skillRow('CSS')).toHaveClass('bg-red-50');
    expect(container.querySelectorAll('.bg-green-50')).toHaveLength(2);
  });

  it('marks all skills unmatched without matched resumes', () => {
    const { container } = renderModal({ matchDetail: makeMatchDetail({ matchedResumes: undefined }) });
    expect(container.querySelectorAll('.bg-red-50')).toHaveLength(3);
    expect(screen.getByText('0 resumes')).toBeInTheDocument();
  });

  it('lists matched resumes sorted by score descending', () => {
    renderModal();
    expect(screen.getByText(`${COPY.LABELS.MATCHED_RESUMES} (2)`)).toBeInTheDocument();
    const names = screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent).filter(
      (t) => t === 'Jane Doe' || t === 'John Roe'
    );
    expect(names).toEqual(['John Roe', 'Jane Doe']);
    expect(screen.getByText('90%')).toHaveClass('text-green-600');
    expect(screen.getByText('60%')).toHaveClass('text-yellow-600');
  });

  it('shows a singular resume count, low score colour and +N skills for a matched resume', () => {
    renderModal({
      matchDetail: makeMatchDetail({
        matchScore: 0.1,
        matchedResumes: [
          {
            resumeId: 'r-3',
            resumeName: 'Solo',
            matchScore: 0.3,
            skillsMatched: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
          },
        ],
      }),
    });
    expect(screen.getByText('1 resume')).toBeInTheDocument();
    expect(screen.getByText('30%')).toHaveClass('text-gray-400');
    expect(screen.getByText('+2 more')).toBeInTheDocument();
    expect(screen.queryByText('f')).not.toBeInTheDocument();
  });

  it('calls onViewResume when a matched resume is clicked', () => {
    const onViewResume = vi.fn();
    renderModal({ onViewResume });
    fireEvent.click(screen.getByText('Jane Doe'));
    expect(onViewResume).toHaveBeenCalledWith('r-1');
  });

  it('ignores resume clicks without onViewResume', () => {
    renderModal();
    expect(() => fireEvent.click(screen.getByText('Jane Doe'))).not.toThrow();
  });

  it('calls onClose from the header button, footer button and backdrop', () => {
    const { props, container } = renderModal();
    fireEvent.click(screen.getAllByRole('button')[0]);
    fireEvent.click(screen.getByRole('button', { name: COPY.LABELS.CLOSE }));
    fireEvent.click(container.querySelector('.bg-opacity-75') as Element);
    expect(props.onClose).toHaveBeenCalledTimes(3);
  });

  it('renders the nested resume detail modal for the selected resume', () => {
    const onCloseResumeDetail = vi.fn();
    const getResumeFileUrl = vi.fn(() => 'https://x/file');
    renderModal({
      selectedResume: makeResume({ file_name: 'nested.pdf' }),
      onCloseResumeDetail,
      getResumeFileUrl,
    });
    expect(screen.getByRole('heading', { name: 'nested.pdf' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: COPY.LABELS.VIEW_ORIGINAL })).toHaveAttribute('href', 'https://x/file');
    const closeButtons = screen.getAllByRole('button', { name: COPY.LABELS.CLOSE });
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    expect(onCloseResumeDetail).toHaveBeenCalledTimes(1);
  });

  it('tolerates closing the nested modal without onCloseResumeDetail', () => {
    const { props } = renderModal({ selectedResume: makeResume({ file_name: 'nested.pdf' }) });
    const closeButtons = screen.getAllByRole('button', { name: COPY.LABELS.CLOSE });
    expect(() => fireEvent.click(closeButtons[closeButtons.length - 1])).not.toThrow();
    expect(props.onClose).not.toHaveBeenCalled();
  });
});
