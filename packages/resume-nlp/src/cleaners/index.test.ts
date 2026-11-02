import { describe, expect, it } from 'vitest';
import { TextCleaner } from './index';

describe('TextCleaner.clean', () => {
  it('returns an empty string for empty input', () => {
    expect(TextCleaner.clean('')).toBe('');
    expect(TextCleaner.clean(undefined as unknown as string)).toBe('');
  });

  it('normalises Windows and old Mac line endings', () => {
    expect(TextCleaner.clean('a\r\nb\rc')).toBe('a\nb\nc');
  });

  it('collapses three or more blank lines into one blank line', () => {
    expect(TextCleaner.clean('a\n\n\n\n\nb')).toBe('a\n\nb');
  });

  it('collapses runs of spaces and tabs but keeps newlines', () => {
    expect(TextCleaner.clean('John  \t Doe\nEngineer')).toBe('John Doe\nEngineer');
  });

  it('trims leading and trailing whitespace', () => {
    expect(TextCleaner.clean('  \n hello \n ')).toBe('hello');
  });
});

describe('TextCleaner.removeSpecialChars', () => {
  it('keeps word characters, whitespace, @, dot and dash', () => {
    expect(TextCleaner.removeSpecialChars('john.doe@mail.com (Lead-Dev)!')).toBe('john.doe@mail.com Lead-Dev');
  });

  it('collapses whitespace introduced by removals', () => {
    expect(TextCleaner.removeSpecialChars('a ### b')).toBe('a b');
  });
});

describe('TextCleaner.normalizeWhitespace', () => {
  it('turns any whitespace run into a single space', () => {
    expect(TextCleaner.normalizeWhitespace(' a\n\tb   c ')).toBe('a b c');
  });
});

describe('TextCleaner.extractEmail', () => {
  it('finds all email addresses', () => {
    const text = 'Contact: jane.doe+cv@example.co.uk or jdoe@corp.io';
    expect(TextCleaner.extractEmail(text)).toEqual(['jane.doe+cv@example.co.uk', 'jdoe@corp.io']);
  });

  it('returns an empty array when there are none', () => {
    expect(TextCleaner.extractEmail('no contact info')).toEqual([]);
  });
});

describe('TextCleaner.extractPhone', () => {
  it.each([
    ['(555) 123-4567'],
    ['555-123-4567'],
    ['555.123.4567'],
    ['+1 555 123 4567'],
  ])('finds %s', (phone) => {
    expect(TextCleaner.extractPhone(`Phone: ${phone}`)).toEqual([phone]);
  });

  it('returns an empty array when there are none', () => {
    expect(TextCleaner.extractPhone('call me maybe')).toEqual([]);
  });
});
