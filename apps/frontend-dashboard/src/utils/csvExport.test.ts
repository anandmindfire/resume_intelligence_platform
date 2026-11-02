import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportResumesToCSV } from './csvExport';
import { COPY } from '../constants';
import { makeResume } from '../test/fixtures';

function readBlobBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

async function readBlob(blob: Blob): Promise<string> {
  // Decode manually with ignoreBOM so the BOM is preserved in the result.
  return new TextDecoder('utf-8', { ignoreBOM: true }).decode(await readBlobBytes(blob));
}

describe('exportResumesToCSV', () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let clickSpy: ReturnType<typeof vi.spyOn>;
  const originalCreateObjectURL = URL.createObjectURL;

  beforeEach(() => {
    createObjectURL = vi.fn(() => 'blob:mock-url');
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
  });

  it('alerts and does nothing when there are no resumes', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    exportResumesToCSV([]);
    expect(alertSpy).toHaveBeenCalledWith(COPY.EXPORT.NO_RESUMES);
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('creates a hidden download link with the default filename, clicks and removes it', () => {
    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const removeSpy = vi.spyOn(document.body, 'removeChild');

    exportResumesToCSV([makeResume()]);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    const link = clickSpy.mock.contexts[0] as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('blob:mock-url');
    expect(link.getAttribute('download')).toBe('resumes.csv');
    expect(link.style.visibility).toBe('hidden');
    expect(appendSpy).toHaveBeenCalledWith(link);
    expect(removeSpy).toHaveBeenCalledWith(link);
    expect(document.body.contains(link)).toBe(false);
  });

  it('uses a custom filename', () => {
    exportResumesToCSV([makeResume()], 'custom.csv');
    const link = clickSpy.mock.contexts[0] as HTMLAnchorElement;
    expect(link.getAttribute('download')).toBe('custom.csv');
  });

  it('writes a BOM-prefixed CSV blob with headers and one row per resume', async () => {
    exportResumesToCSV([
      makeResume({
        id: 'r-1',
        file_name: 'a.pdf',
        name: 'Jane Doe',
        email: 'jane@example.com',
        phone: '555',
        skills: ['React', 'Node'],
        experience: [{}, {}],
        education: [{}],
        status: 'completed',
        created_at: '2024-03-15T10:00:00.000Z',
      }),
      makeResume({
        id: 'r-2',
        file_name: 'b.pdf',
        name: undefined,
        email: undefined,
        phone: undefined,
        skills: undefined,
        experience: undefined,
        education: undefined,
        status: '',
        created_at: undefined,
      }),
    ]);

    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('text/csv;charset=utf-8;');
    const text = await readBlob(blob);
    expect(text.charCodeAt(0)).toBe(0xfeff);

    const lines = text.slice(1).split('\n');
    expect(lines[0]).toBe(
      'ID,File Name,Name,Email,Phone,Skills,Experience Count,Education Count,Status,Created At'
    );
    expect(lines[1]).toBe(
      'r-1,a.pdf,Jane Doe,jane@example.com,555,React; Node,2,1,completed,2024-03-15T10:00:00.000Z'
    );
    expect(lines[2]).toBe('r-2,b.pdf,,,,,0,0,,');
    expect(lines).toHaveLength(3);
  });

  it('quotes and escapes cells containing commas, quotes or newlines', async () => {
    exportResumesToCSV([
      makeResume({
        id: 'r-3',
        file_name: 'x.pdf',
        name: 'Doe, Jane',
        email: 'say "hi"',
        phone: 'line1\nline2',
        skills: [],
        experience: [],
        education: [],
        status: 'parsed',
        created_at: undefined,
      }),
    ]);
    const text = (await readBlob(createObjectURL.mock.calls[0][0] as Blob)).slice(1);
    expect(text).toContain('r-3,x.pdf,"Doe, Jane","say ""hi""","line1\nline2",,0,0,parsed,');
  });
});
