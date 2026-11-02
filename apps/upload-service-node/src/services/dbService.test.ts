import { describe, expect, it, vi } from 'vitest';

const { MockPool, client, pool } = vi.hoisted(() => {
  const client = { query: vi.fn(), release: vi.fn() };
  const pool = { connect: vi.fn(async () => client), end: vi.fn() };
  const MockPool = vi.fn(() => pool);
  return { MockPool, client, pool };
});

vi.mock('pg', () => ({ Pool: MockPool }));

import { config } from '@resume-platform/config';
import { dbService } from './dbService';
import { DELETE_RESUME, GET_RESUME_BY_ID, INSERT_RESUME, UPDATE_RESUME_STATUS } from '../queries';

// The pool is created once at module load; capture its options before mocks are cleared.
const poolOptions = MockPool.mock.calls[0];

describe('dbService (upload)', () => {
  it('creates the pool from config with the documented timeouts', () => {
    expect(poolOptions).toEqual([
      {
        host: config.database.host,
        port: config.database.port,
        user: config.database.user,
        password: config.database.password,
        database: config.database.database,
        max: config.database.poolMax,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      },
    ]);
  });

  it('createResume inserts a row with positional parameters', async () => {
    client.query.mockResolvedValueOnce({ rows: [] });

    await dbService.createResume({
      id: 'r-1',
      fileName: 'jane.pdf',
      filePath: '/uploads/x.pdf',
      mimeType: 'application/pdf',
      fileSize: 123,
      status: 'uploaded',
    });

    expect(client.query).toHaveBeenCalledWith(INSERT_RESUME, [
      'r-1',
      'jane.pdf',
      '/uploads/x.pdf',
      'application/pdf',
      123,
      'uploaded',
    ]);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('getResume returns the row', async () => {
    const row = { id: 'r-1', file_name: 'jane.pdf' };
    client.query.mockResolvedValueOnce({ rows: [row] });

    await expect(dbService.getResume('r-1')).resolves.toBe(row);
    expect(client.query).toHaveBeenCalledWith(GET_RESUME_BY_ID, ['r-1']);
  });

  it('getResume returns null when there is no row', async () => {
    client.query.mockResolvedValueOnce({ rows: [] });
    await expect(dbService.getResume('missing')).resolves.toBeNull();
  });

  it('updateResumeStatus passes status then id', async () => {
    client.query.mockResolvedValueOnce({ rows: [] });
    await dbService.updateResumeStatus('r-1', 'failed');
    expect(client.query).toHaveBeenCalledWith(UPDATE_RESUME_STATUS, ['failed', 'r-1']);
  });

  it('deleteResume deletes by id', async () => {
    client.query.mockResolvedValueOnce({ rows: [] });
    await dbService.deleteResume('r-1');
    expect(client.query).toHaveBeenCalledWith(DELETE_RESUME, ['r-1']);
  });

  it('releases the client even when the query fails', async () => {
    client.query.mockRejectedValueOnce(new Error('db down'));

    await expect(dbService.getResume('r-1')).rejects.toThrow('db down');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('close ends the pool', async () => {
    await dbService.close();
    expect(pool.end).toHaveBeenCalled();
  });
});
