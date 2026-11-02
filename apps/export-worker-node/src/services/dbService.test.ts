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
import { GET_RESUMES_BY_IDS, GET_RESUMES_FOR_EXPORT_ALL } from '../queries';

// The pool is created once at module load; capture its options before mocks are cleared.
const [poolOptions] = MockPool.mock.calls[0] as unknown as [Record<string, unknown>];

describe('export dbService', () => {
  it('opens a pool from the database config', () => {
    expect(poolOptions).toEqual({
      host: config.database.host,
      port: config.database.port,
      user: config.database.user,
      password: config.database.password,
      database: config.database.database,
      max: 20,
    });
  });

  it('exports all resumes when no ids are given', async () => {
    client.query.mockResolvedValue({ rows: [] });

    await dbService.getResumesForExport();
    await dbService.getResumesForExport([]);

    expect(client.query).toHaveBeenNthCalledWith(1, GET_RESUMES_FOR_EXPORT_ALL, []);
    expect(client.query).toHaveBeenNthCalledWith(2, GET_RESUMES_FOR_EXPORT_ALL, []);
  });

  it('exports only the requested ids', async () => {
    client.query.mockResolvedValueOnce({ rows: [] });
    await dbService.getResumesForExport(['a', 'b']);
    expect(client.query).toHaveBeenCalledWith(GET_RESUMES_BY_IDS, [['a', 'b']]);
  });

  it('flattens rows into CSV-friendly records', async () => {
    const createdAt = new Date('2026-01-01T00:00:00Z');
    client.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'r1',
          file_name: 'jane.pdf',
          name: 'Jane',
          email: 'jane@example.com',
          phone: '+1555',
          skills: ['go', 'sql'],
          experience: [{}, {}],
          education: [{}],
          status: 'matched',
          created_at: createdAt,
        },
        { id: 'r2', file_name: null, name: null, email: null, phone: null, skills: null, experience: null, education: 'bad', status: null, created_at: null },
      ],
    });

    await expect(dbService.getResumesForExport()).resolves.toEqual([
      {
        id: 'r1',
        file_name: 'jane.pdf',
        name: 'Jane',
        email: 'jane@example.com',
        phone: '+1555',
        skills: 'go; sql',
        experience_count: 2,
        education_count: 1,
        status: 'matched',
        created_at: createdAt,
      },
      {
        id: 'r2',
        file_name: '',
        name: '',
        email: '',
        phone: '',
        skills: '',
        experience_count: 0,
        education_count: 0,
        status: '',
        created_at: '',
      },
    ]);
  });

  it('releases the client when the query fails', async () => {
    client.query.mockRejectedValueOnce(new Error('db down'));
    await expect(dbService.getResumesForExport()).rejects.toThrow('db down');
    expect(client.release).toHaveBeenCalled();
  });

  it('close ends the pool', async () => {
    await dbService.close();
    expect(pool.end).toHaveBeenCalled();
  });
});
