import { describe, expect, it } from 'vitest';
import { buildCountResumesQuery, buildFindAllResumesQuery } from './resume.queries';

/** Collapse whitespace so assertions don't depend on query formatting. */
const squash = (sql: string) => sql.replace(/\s+/g, ' ').trim();

describe.each([
  ['buildCountResumesQuery', (filters: Parameters<typeof buildCountResumesQuery>[0]) => buildCountResumesQuery(filters)],
  [
    'buildFindAllResumesQuery',
    (filters: Parameters<typeof buildCountResumesQuery>[0]) => {
      // Strip the ORDER BY / LIMIT tail so filter assertions are shared with the count query.
      const { text, values } = buildFindAllResumesQuery(filters, 10, 0);
      return { text: text.replace(/ ORDER BY .*$/s, ''), values: values.slice(0, -2) };
    },
  ],
])('%s filters', (_name, build) => {
  it('has no conditions without filters', () => {
    const { text, values } = build({});
    expect(squash(text)).toMatch(/FROM resumes WHERE 1=1$/);
    expect(values).toEqual([]);
  });

  it('matches the keyword against name and file name with one parameter', () => {
    const { text, values } = build({ keyword: 'jane' });
    expect(squash(text)).toContain('AND (name ILIKE $1 OR file_name ILIKE $1)');
    expect(values).toEqual(['%jane%']);
  });

  it('matches location', () => {
    const { text, values } = build({ location: 'Pune' });
    expect(squash(text)).toContain('AND location ILIKE $1');
    expect(values).toEqual(['%Pune%']);
  });

  it('filters by role only when minScore is 0 or absent', () => {
    for (const minScore of [undefined, 0]) {
      const { text, values } = build({ roleId: 'role-1', minScore });
      expect(squash(text)).toContain('AND id IN (SELECT resume_id FROM resume_matches WHERE role_id = $1)');
      expect(values).toEqual(['role-1']);
    }
  });

  it('filters by role and minimum score together', () => {
    const { text, values } = build({ roleId: 'role-1', minScore: 70 });
    expect(squash(text)).toContain(
      'AND id IN ( SELECT resume_id FROM resume_matches WHERE role_id = $1 AND match_score >= $2 )'
    );
    expect(values).toEqual(['role-1', 70]);
  });

  it('filters by minimum score across all roles', () => {
    const { text, values } = build({ minScore: 50 });
    expect(squash(text)).toContain('AND id IN ( SELECT resume_id FROM resume_matches WHERE match_score >= $1 )');
    expect(values).toEqual([50]);
  });

  it('numbers parameters sequentially when combining filters', () => {
    const { text, values } = build({ keyword: 'jane', location: 'Pune', roleId: 'role-1', minScore: 60 });
    const sql = squash(text);
    expect(sql).toContain('name ILIKE $1');
    expect(sql).toContain('location ILIKE $2');
    expect(sql).toContain('role_id = $3 AND match_score >= $4');
    expect(values).toEqual(['%jane%', '%Pune%', 'role-1', 60]);
  });

  it('never interpolates user input into the SQL text', () => {
    const evil = "'; DROP TABLE resumes; --";
    const { text } = build({ keyword: evil, location: evil, roleId: evil, minScore: 1 });
    expect(text).not.toContain('DROP TABLE');
  });
});

describe('buildCountResumesQuery', () => {
  it('selects a count', () => {
    expect(buildCountResumesQuery({}).text).toMatch(/^SELECT COUNT\(\*\) as count FROM resumes/);
  });
});

describe('buildFindAllResumesQuery', () => {
  it('appends ORDER BY, LIMIT and OFFSET after the filter parameters', () => {
    const { text, values } = buildFindAllResumesQuery({ keyword: 'jane' }, 25, 50, 'name', 'asc');
    expect(squash(text)).toMatch(/ORDER BY name asc LIMIT \$2 OFFSET \$3$/);
    expect(values).toEqual(['%jane%', 25, 50]);
  });

  it('defaults to newest first with offset 0', () => {
    const { text, values } = buildFindAllResumesQuery({}, 10);
    expect(squash(text)).toMatch(/ORDER BY created_at desc LIMIT \$1 OFFSET \$2$/);
    expect(values).toEqual([10, 0]);
  });

  it.each(['created_at', 'name', 'file_name', 'status'])('allows sorting by %s', (column) => {
    expect(buildFindAllResumesQuery({}, 10, 0, column).text).toContain(`ORDER BY ${column} `);
  });

  it('falls back to created_at for unknown sort columns, preventing SQL injection', () => {
    const { text } = buildFindAllResumesQuery({}, 10, 0, 'id; DROP TABLE resumes');
    expect(text).toContain('ORDER BY created_at ');
    expect(text).not.toContain('DROP');
  });
});
