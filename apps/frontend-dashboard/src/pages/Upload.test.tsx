import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { COPY } from '../constants';
import type { BulkUploadResponse } from '../types';

vi.mock('../services/uploadService', () => ({
  uploadService: { uploadMultiple: vi.fn() },
}));

import { uploadService } from '../services/uploadService';
import { Upload } from './Upload';

const uploadMultiple = vi.mocked(uploadService.uploadMultiple);

function pdf(name = 'cv.pdf') {
  return new File(['%PDF'], name, { type: 'application/pdf' });
}

function selectFiles(container: HTMLElement, files: File[]) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files } });
}

describe('Upload page', () => {
  it('renders the dropzone with supported formats', () => {
    const { container } = render(<Upload />);
    expect(screen.getByText(COPY.PAGES.UPLOAD.TITLE)).toBeInTheDocument();
    expect(screen.getByText(COPY.UPLOAD.DRAG_DROP)).toBeInTheDocument();
    COPY.UPLOAD.FILE_FORMATS.forEach((f) => expect(screen.getByText(f)).toBeInTheDocument());
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toHaveAttribute('multiple');
    expect(input.getAttribute('accept')).toContain('.pdf');
    expect(input.getAttribute('accept')).toContain('.docx');
  });

  it('shows the drag-active state while dragging files over the dropzone', async () => {
    render(<Upload />);
    const zone = screen.getByText(COPY.UPLOAD.DRAG_DROP).closest('[role="presentation"]') as HTMLElement;
    await act(async () => {
      fireEvent.dragEnter(zone, {
        dataTransfer: { files: [pdf()], items: [{ kind: 'file', type: 'application/pdf' }], types: ['Files'] },
      });
    });
    expect(await screen.findByText(COPY.UPLOAD.DROP_HERE)).toBeInTheDocument();
    expect(screen.getByText(COPY.UPLOAD.RELEASE)).toBeInTheDocument();
  });

  it('uploads selected files and shows a summary with per-file results', async () => {
    const response: BulkUploadResponse = {
      total: 3,
      success: 2,
      failed: 1,
      results: [
        { fileName: 'a.pdf', status: 'uploaded', resumeId: '1234567890abcdef' },
        { fileName: 'b.pdf', status: 'uploaded' },
        { fileName: 'c.pdf', status: 'failed', error: 'Corrupt file' },
      ],
    };
    let resolveUpload!: (v: BulkUploadResponse) => void;
    uploadMultiple.mockReturnValue(new Promise((r) => (resolveUpload = r)));

    const { container } = render(<Upload />);
    const files = [pdf('a.pdf'), pdf('b.pdf')];
    selectFiles(container, files);

    expect(await screen.findByText(COPY.LOADING.UPLOADING)).toBeInTheDocument();
    expect(screen.getByText(COPY.LOADING.UPLOADING_WAIT)).toBeInTheDocument();

    const formData = uploadMultiple.mock.calls[0][0];
    expect(formData.getAll('resumes')).toEqual(files);

    await act(async () => resolveUpload(response));

    expect(screen.queryByText(COPY.LOADING.UPLOADING)).not.toBeInTheDocument();
    expect(screen.getByText(COPY.UPLOAD.UPLOAD_SUMMARY)).toBeInTheDocument();
    expect(screen.getByText('3 files processed successfully')).toBeInTheDocument();
    expect(screen.getByText(COPY.UPLOAD.SUCCESSFUL, { selector: 'div' }).previousElementSibling).toHaveTextContent('2');
    expect(screen.getByText(COPY.UPLOAD.FAILED, { selector: 'div' }).previousElementSibling).toHaveTextContent('1');

    expect(screen.getByText('a.pdf')).toBeInTheDocument();
    expect(screen.getByText('12345678...')).toBeInTheDocument();
    expect(screen.getAllByText(COPY.UPLOAD.QUEUED)).toHaveLength(2);
    expect(screen.getByText('Corrupt file')).toBeInTheDocument();
    expect(screen.getAllByText('Uploaded')).toHaveLength(2);
    expect(screen.getByText('Failed', { selector: '.badge' })).toBeInTheDocument();
  });

  it('hides the failed counter when every file succeeded and uses singular wording', async () => {
    uploadMultiple.mockResolvedValue({
      total: 1,
      success: 1,
      failed: 0,
      results: [{ fileName: 'only.pdf', status: 'uploaded' }],
    });
    const { container } = render(<Upload />);
    selectFiles(container, [pdf('only.pdf')]);
    expect(await screen.findByText('1 file processed successfully')).toBeInTheDocument();
    expect(screen.queryByText(COPY.UPLOAD.FAILED, { selector: 'div' })).not.toBeInTheDocument();
  });

  it('shows no summary when the response has no results', async () => {
    uploadMultiple.mockResolvedValue({} as BulkUploadResponse);
    const { container } = render(<Upload />);
    selectFiles(container, [pdf()]);
    await waitFor(() => expect(uploadMultiple).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText(COPY.LOADING.UPLOADING)).not.toBeInTheDocument());
    expect(screen.queryByText(COPY.UPLOAD.UPLOAD_SUMMARY)).not.toBeInTheDocument();
  });

  it('alerts with the error message when the upload fails', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    uploadMultiple.mockRejectedValue(new Error('Payload too large'));
    const { container } = render(<Upload />);
    selectFiles(container, [pdf()]);
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(`${COPY.ERRORS.UPLOAD_FAILED}: Payload too large`)
    );
    await waitFor(() => expect(screen.queryByText(COPY.LOADING.UPLOADING)).not.toBeInTheDocument());
  });

  it('alerts with "Unknown error" for non-Error rejections', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    uploadMultiple.mockRejectedValue('nope');
    const { container } = render(<Upload />);
    selectFiles(container, [pdf()]);
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(`${COPY.ERRORS.UPLOAD_FAILED}: Unknown error`)
    );
  });
});
