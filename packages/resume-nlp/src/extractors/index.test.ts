import { describe, expect, it } from 'vitest';
import { ResumeExtractor } from './index';

const fullResume = [
  'Jane Smith',
  'jane.smith@example.com | (415) 555-2671',
  '',
  'Experience',
  'Senior Software Engineer',
  'Acme Corp',
  'January 2019 - March 2023',
  'Built microservices with Node and Docker on AWS.',
  '',
  'Software Developer',
  'Globex',
  '',
  'Education',
  'Bachelor of Science in Computer Science',
  'Stanford University',
  'June 2015',
  '',
  'Skills',
  'JavaScript, TypeScript, React, PostgreSQL, Kubernetes, Git',
].join('\n');

describe('ResumeExtractor.extract', () => {
  const result = ResumeExtractor.extract(fullResume);

  it('returns the cleaned raw text', () => {
    expect(result.rawText).toBe(fullResume.trim());
  });

  it('extracts the email address', () => {
    expect(result.email).toBe('jane.smith@example.com');
  });

  it('extracts and normalises the phone number to E.164', () => {
    expect(result.phone).toBe('+14155552671');
  });

  it('extracts the candidate name from the first line', () => {
    expect(result.name).toBeDefined();
    expect(result.name).toContain('Jane');
  });

  it('detects known skill keywords', () => {
    expect(result.skills).toEqual(
      expect.arrayContaining(['javascript', 'typescript', 'react', 'node', 'docker', 'aws', 'kubernetes', 'git', 'postgresql'])
    );
  });

  it('never returns duplicate skills', () => {
    expect(new Set(result.skills).size).toBe(result.skills.length);
  });

  it('extracts experience entries with title, company and description', () => {
    expect(result.experience.length).toBeGreaterThanOrEqual(1);
    const [first] = result.experience;
    expect(first.title).toBe('Senior Software Engineer');
    expect(first.company).toBe('Acme Corp');
    expect(first.description).toContain('microservices');
  });

  it('extracts the education degree and graduation date', () => {
    expect(result.education.length).toBeGreaterThanOrEqual(1);
    const [first] = result.education;
    expect(first.degree).toBe('Bachelor of Science in Computer Science');
    expect(first.graduationDate).toMatch(/^2015-06/);
  });

  // BUG: the section-header regex (/education|academic|university|college|degree/i) also matches
  // "Stanford University", so the line is treated as a header and the institution is never captured.
  it.fails('extracts an institution whose name contains "University"', () => {
    expect(result.education[0].institution).toBe('Stanford University');
  });

  it('extracts an institution whose name contains "Institute"', () => {
    const { education } = ResumeExtractor.extract(
      'Education\nMaster of Engineering\nMassachusetts Institute of Technology'
    );
    expect(education[0]).toMatchObject({
      degree: 'Master of Engineering',
      institution: 'Massachusetts Institute of Technology',
    });
  });
});

describe('ResumeExtractor.extract edge cases', () => {
  it('handles empty text', () => {
    const result = ResumeExtractor.extract('');
    expect(result).toMatchObject({
      name: undefined,
      email: undefined,
      phone: undefined,
      experience: [],
      education: [],
      rawText: '',
    });
    expect(result.skills).toEqual([]);
  });

  it('does not treat a first line containing an email as the name', () => {
    const result = ResumeExtractor.extract('jane@example.com\nSome text');
    expect(result.name).toBeUndefined();
    expect(result.email).toBe('jane@example.com');
  });

  it('does not use an overly long first line as the name', () => {
    const longLine = 'Experienced professional seeking a challenging role in a growing company';
    expect(ResumeExtractor.extract(longLine).name).toBeUndefined();
  });

  it('falls back to the raw phone match when it cannot be validated', () => {
    const result = ResumeExtractor.extract('Phone: 000-000-0000');
    expect(result.phone).toBe('000-000-0000');
  });

  it('returns no experience when there is no experience section', () => {
    expect(ResumeExtractor.extract('John Doe\nLikes hiking').experience).toEqual([]);
  });

  it('flushes a trailing experience entry without a blank line', () => {
    const result = ResumeExtractor.extract('Work History\nLead Developer\nInitech');
    expect(result.experience).toEqual([{ title: 'Lead Developer', company: 'Initech' }]);
  });

  it('records a degree without an institution', () => {
    const result = ResumeExtractor.extract('Education\nMaster of Arts');
    expect(result.education).toEqual([{ degree: 'Master of Arts' }]);
  });
});
