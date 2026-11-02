import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ResumeTable } from './ResumeTable';
import { makeResume } from '../test/fixtures';
import { COPY } from '../constants';

describe('ResumeTable', () => {
  it('renders column headers without an actions column when no handlers are given', () => {
    render(<ResumeTable resumes={[makeResume()]} />);
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual([
      'File Name',
      'Name',
      'Email',
      'Phone',
      'Skills',
      'Experience',
      'Education',
      'Status',
      'Created At',
    ]);
    expect(screen.queryByTitle('Download Original')).not.toBeInTheDocument();
  });

  it('renders a row per resume with formatted values', () => {
    render(<ResumeTable resumes={[makeResume()]} />);
    const row = screen.getAllByRole('row')[1];
    const cells = within(row).getAllByRole('cell');
    expect(cells[0]).toHaveTextContent('jane_doe.pdf');
    expect(cells[1]).toHaveTextContent('Jane Doe');
    expect(cells[2]).toHaveTextContent('jane@example.com');
    expect(cells[3]).toHaveTextContent('555-0100');
    expect(cells[4]).toHaveTextContent('ReactTypeScript');
    expect(cells[5]).toHaveTextContent('1');
    expect(cells[6]).toHaveTextContent('1');
    expect(cells[7]).toHaveTextContent('Completed');
    expect(cells[8]).toHaveTextContent('Mar 15, 2024');
  });

  it('shows placeholders for missing fields', () => {
    render(
      <ResumeTable
        resumes={[
          makeResume({
            name: undefined,
            email: '',
            phone: undefined,
            skills: undefined,
            experience: undefined,
            education: undefined,
            created_at: undefined,
          }),
        ]}
      />
    );
    const cells = within(screen.getAllByRole('row')[1]).getAllByRole('cell');
    [1, 2, 3, 4, 8].forEach((i) => expect(cells[i]).toHaveTextContent('-'));
    expect(cells[5]).toHaveTextContent('0');
    expect(cells[6]).toHaveTextContent('0');
  });

  it('shows the first three skills and a +N counter', () => {
    render(<ResumeTable resumes={[makeResume({ skills: ['A', 'B', 'C', 'D', 'E'] })]} />);
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
    expect(screen.queryByText('D')).not.toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('renders an empty state when there are no resumes', () => {
    render(<ResumeTable resumes={[]} />);
    expect(screen.getByText(COPY.EMPTY.NO_RESUMES)).toBeInTheDocument();
    expect(screen.getByText(COPY.EMPTY.NO_RESUMES).closest('td')).toHaveAttribute('colspan', '9');
  });

  it('spans the actions column in the empty state when onRowClick is given', () => {
    render(<ResumeTable resumes={[]} onRowClick={vi.fn()} />);
    expect(screen.getByText(COPY.EMPTY.NO_RESUMES).closest('td')).toHaveAttribute('colspan', '10');
  });

  it('spans the actions column in the empty state when only onDelete is given', () => {
    render(<ResumeTable resumes={[]} onDelete={vi.fn()} />);
    expect(screen.getByText(COPY.EMPTY.NO_RESUMES).closest('td')).toHaveAttribute('colspan', '10');
  });

  it('spans only the data columns in the empty state when there are no actions', () => {
    render(<ResumeTable resumes={[]} />);
    expect(screen.getByText(COPY.EMPTY.NO_RESUMES).closest('td')).toHaveAttribute('colspan', '9');
  });

  it('calls onRowClick when a row or the view button is clicked', () => {
    const onRowClick = vi.fn();
    const resume = makeResume();
    render(<ResumeTable resumes={[resume]} onRowClick={onRowClick} />);
    const row = screen.getAllByRole('row')[1];
    expect(row).toHaveClass('cursor-pointer');

    fireEvent.click(row);
    expect(onRowClick).toHaveBeenCalledWith(resume);

    fireEvent.click(screen.getByTitle(COPY.LABELS.VIEW_DETAILS));
    expect(onRowClick).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument();
    expect(screen.queryByTitle('Delete')).not.toBeInTheDocument();
  });

  it('calls onDelete with the id without triggering row click', () => {
    const onRowClick = vi.fn();
    const onDelete = vi.fn();
    render(<ResumeTable resumes={[makeResume({ id: 'r-9' })]} onRowClick={onRowClick} onDelete={onDelete} />);
    fireEvent.click(screen.getByTitle('Delete'));
    expect(onDelete).toHaveBeenCalledWith('r-9');
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('renders a download link using the default file URL builder', () => {
    const onRowClick = vi.fn();
    render(<ResumeTable resumes={[makeResume({ id: 'r-5' })]} onDelete={vi.fn()} onRowClick={onRowClick} />);
    const link = screen.getByTitle('Download Original');
    expect(link).toHaveAttribute('href', '/api/upload/resumes/r-5/file');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    fireEvent.click(link);
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('uses a custom getResumeFileUrl and hides the view button without onRowClick', () => {
    const getUrl = vi.fn((id: string) => `https://cdn/${id}`);
    render(<ResumeTable resumes={[makeResume({ id: 'r-6' })]} onDelete={vi.fn()} getResumeFileUrl={getUrl} />);
    expect(screen.getByTitle('Download Original')).toHaveAttribute('href', 'https://cdn/r-6');
    expect(screen.queryByTitle(COPY.LABELS.VIEW_DETAILS)).not.toBeInTheDocument();
    expect(screen.getAllByRole('row')[1]).not.toHaveClass('cursor-pointer');
    // clicking a non-interactive row is a no-op
    fireEvent.click(screen.getAllByRole('row')[1]);
  });
});
