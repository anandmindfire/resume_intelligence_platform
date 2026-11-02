import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { JobCard } from './JobCard';
import { makeJob } from '../test/fixtures';

describe('JobCard', () => {
  it('renders job title, domain, location, experience and id', () => {
    render(<JobCard job={makeJob()} onClick={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Frontend Developer' })).toBeInTheDocument();
    expect(screen.getByText('Web')).toBeInTheDocument();
    expect(screen.getByText('Remote')).toBeInTheDocument();
    expect(screen.getByText('2+ years')).toBeInTheDocument();
    expect(screen.getByText('Job ID: JOB-1')).toBeInTheDocument();
    expect(screen.getByText('Required Skills')).toBeInTheDocument();
    expect(screen.getByText('View Details')).toBeInTheDocument();
  });

  it('shows up to five skills and a "+N more" indicator', () => {
    render(
      <JobCard
        job={makeJob({ skills: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] })}
        onClick={vi.fn()}
      />
    );
    ['A', 'B', 'C', 'D', 'E'].forEach((s) => expect(screen.getByText(s)).toBeInTheDocument());
    expect(screen.queryByText('F')).not.toBeInTheDocument();
    expect(screen.getByText('+2 more')).toBeInTheDocument();
  });

  it('does not show "+N more" with five or fewer skills', () => {
    render(<JobCard job={makeJob()} onClick={vi.fn()} />);
    expect(screen.queryByText(/more$/)).not.toBeInTheDocument();
  });

  it('hides the match summary when there are no matches', () => {
    render(<JobCard job={makeJob()} onClick={vi.fn()} />);
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
  });

  it('shows a green score for high matches with pluralised count', () => {
    render(<JobCard job={makeJob()} matchCount={3} avgMatchScore={0.82} onClick={vi.fn()} />);
    expect(screen.getByText('82%')).toHaveClass('text-green-600');
    expect(screen.getByText('3 matches')).toBeInTheDocument();
  });

  it('shows a yellow score for medium matches and singular count', () => {
    render(<JobCard job={makeJob()} matchCount={1} avgMatchScore={55} onClick={vi.fn()} />);
    expect(screen.getByText('55%')).toHaveClass('text-yellow-600');
    expect(screen.getByText('1 match')).toBeInTheDocument();
  });

  it('shows a grey score for low matches', () => {
    render(<JobCard job={makeJob()} matchCount={2} avgMatchScore={0} onClick={vi.fn()} />);
    expect(screen.getByText('0%')).toHaveClass('text-gray-400');
  });

  it('shows the score when only an average is provided', () => {
    render(<JobCard job={makeJob()} avgMatchScore={0.3} onClick={vi.fn()} />);
    expect(screen.getByText('30%')).toBeInTheDocument();
    expect(screen.getByText('0 matches')).toBeInTheDocument();
  });

  it('calls onClick when the card is clicked', () => {
    const onClick = vi.fn();
    render(<JobCard job={makeJob()} onClick={onClick} />);
    fireEvent.click(screen.getByText('Frontend Developer'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
