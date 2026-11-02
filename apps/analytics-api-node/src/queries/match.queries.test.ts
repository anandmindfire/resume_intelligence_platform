import { describe, expect, it } from 'vitest';
import { getCountByRoleQuery, getFindByRoleQuery } from './match.queries';

const squash = (sql: string) => sql.replace(/\s+/g, ' ').trim();

describe('getFindByRoleQuery', () => {
  it('filters by minimum score only and pages with $2/$3 when no role is given', () => {
    const query = getFindByRoleQuery();
    const sql = squash(query.text);

    expect(sql).toContain('WHERE rm.match_score >= $1');
    expect(sql).not.toContain('rm.role_id = $');
    expect(sql).toMatch(/ORDER BY rm.match_score DESC LIMIT \$2 OFFSET \$3$/);
    expect(query).toMatchObject({ paramCount: 3, limitIndex: 2, offsetIndex: 3 });
  });

  it('adds a role filter as $2 and shifts paging to $3/$4', () => {
    const query = getFindByRoleQuery('role-1');
    const sql = squash(query.text);

    expect(sql).toContain('WHERE rm.match_score >= $1 AND rm.role_id = $2');
    expect(sql).toMatch(/LIMIT \$3 OFFSET \$4$/);
    expect(query).toMatchObject({ paramCount: 4, limitIndex: 3, offsetIndex: 4 });
  });

  it('joins resume and role details', () => {
    const sql = squash(getFindByRoleQuery().text);
    expect(sql).toContain('JOIN resumes r ON rm.resume_id = r.id');
    expect(sql).toContain('JOIN job_roles jr ON rm.role_id = jr.id');
    expect(sql).toContain('jr.title as role_title');
  });

  it('does not interpolate the role id', () => {
    expect(getFindByRoleQuery("x'; DROP TABLE job_roles; --").text).not.toContain('DROP');
  });
});

describe('getCountByRoleQuery', () => {
  it('counts by minimum score only without a role', () => {
    const query = getCountByRoleQuery();
    expect(squash(query.text)).toBe('SELECT COUNT(*) as count FROM resume_matches rm WHERE rm.match_score >= $1');
    expect(query.paramCount).toBe(1);
  });

  it('adds a role filter when given', () => {
    const query = getCountByRoleQuery('role-1');
    expect(squash(query.text)).toMatch(/WHERE rm.match_score >= \$1 AND rm.role_id = \$2$/);
    expect(query.paramCount).toBe(2);
  });
});
