import { describe, expect, it } from 'vitest';
import { ResumeParser } from './index';

const resume = `John Doe

Summary
Backend engineer with 6 years of experience.

Skills
TypeScript, Node.js, PostgreSQL

Education
BSc Computer Science`;

describe('ResumeParser.parseSection', () => {
  it('returns the body of a section without its heading', () => {
    expect(ResumeParser.parseSection(resume, 'Skills')).toBe('TypeScript, Node.js, PostgreSQL');
  });

  it('matches the heading case-insensitively', () => {
    expect(ResumeParser.parseSection(resume, 'summary')).toBe('Backend engineer with 6 years of experience.');
  });

  it('reads the final section up to the end of the text', () => {
    expect(ResumeParser.parseSection(resume, 'Education')).toBe('BSc Computer Science');
  });

  it('returns an empty string when the section does not exist', () => {
    expect(ResumeParser.parseSection(resume, 'Certifications')).toBe('');
  });
});
