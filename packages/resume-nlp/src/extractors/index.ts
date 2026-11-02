import nlp from 'compromise';
import * as chrono from 'chrono-node';
import { TextCleaner } from '../cleaners';
import validator from 'email-validator';
import { phone } from 'phone';

type NlpDoc = ReturnType<typeof nlp>;

export interface ExtractedResume {
  name?: string;
  email?: string;
  phone?: string;
  skills: string[];
  experience: Experience[];
  education: Education[];
  rawText: string;
}

export interface Experience {
  title?: string;
  company?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  duration?: string;
}

export interface Education {
  degree?: string;
  institution?: string;
  field?: string;
  graduationDate?: string;
}

/**
 * A short line that starts with an education keyword, e.g. "Education", "ACADEMIC BACKGROUND:", "Qualifications".
 * Deliberately not a substring match: "Stanford University" or "Degree: B.Sc." are content, not headings.
 */
const EDUCATION_HEADING = /^(education|academics?|academic\s+\w+|qualifications?)\b/i;
const MAX_HEADING_LENGTH = 40;

function isEducationHeading(line: string): boolean {
  return line.length <= MAX_HEADING_LENGTH && EDUCATION_HEADING.test(line);
}

export class ResumeExtractor {
  static extract(text: string): ExtractedResume {
    const cleaned = TextCleaner.clean(text);
    const doc = nlp(cleaned);

    return {
      name: this.extractName(cleaned, doc),
      email: this.extractEmail(cleaned),
      phone: this.extractPhone(cleaned),
      skills: this.extractSkills(cleaned, doc),
      experience: this.extractExperience(cleaned),
      education: this.extractEducation(cleaned),
      rawText: cleaned,
    };
  }

  private static extractName(text: string, doc: NlpDoc): string | undefined {
    // Try to find name at the beginning of the document
    const firstLine = text.split('\n')[0]?.trim();
    if (firstLine && firstLine.length < 50 && !firstLine.includes('@')) {
      const persons = doc.people().out('array');
      if (persons.length > 0) {
        return persons[0];
      }
      // If no person detected, use first line if it looks like a name
      if (/^[A-Z][a-z]+ [A-Z]/.test(firstLine)) {
        return firstLine;
      }
    }
    return undefined;
  }

  private static extractEmail(text: string): string | undefined {
    const emails = TextCleaner.extractEmail(text);
    if (emails.length > 0) {
      const validEmail = emails.find(e => validator.validate(e));
      return validEmail || emails[0];
    }
    return undefined;
  }

  private static extractPhone(text: string): string | undefined {
    const phones = TextCleaner.extractPhone(text);
    if (phones.length > 0) {
      try {
        const result = phone(phones[0], { country: 'US' });
        if (result.isValid && result.phoneNumber) {
          return result.phoneNumber;
        }
        return phones[0];
      } catch {
        return phones[0];
      }
    }
    return undefined;
  }

  private static extractSkills(text: string, doc: NlpDoc): string[] {
    const skillKeywords = [
      'javascript', 'typescript', 'python', 'java', 'react', 'node', 'sql',
      'aws', 'docker', 'kubernetes', 'git', 'mongodb', 'postgresql',
      'machine learning', 'ai', 'agile', 'scrum', 'ci/cd', 'rest api',
      'graphql', 'microservices', 'linux', 'html', 'css', 'angular', 'vue',
    ];

    const foundSkills: string[] = [];
    const lowerText = text.toLowerCase();

    for (const skill of skillKeywords) {
      if (lowerText.includes(skill.toLowerCase())) {
        foundSkills.push(skill);
      }
    }

    // Also extract technical terms using NLP
    const nouns = doc.nouns().out('array');
    const technicalTerms = nouns.filter((term: string) => {
      const lower = term.toLowerCase();
      return lower.length > 3 && 
             !['experience', 'education', 'summary', 'objective'].includes(lower);
    });

    return [...new Set([...foundSkills, ...technicalTerms.slice(0, 10)])];
  }

  private static extractExperience(text: string): Experience[] {
    const experiences: Experience[] = [];
    const lines = text.split('\n');

    let currentExp: Partial<Experience> = {};
    let inExperienceSection = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Detect experience section
      if (/experience|work history|employment|career/i.test(line)) {
        inExperienceSection = true;
        continue;
      }

      if (inExperienceSection) {
        // Try to parse dates
        const dates = chrono.parse(line);
        if (dates.length > 0) {
          if (!currentExp.startDate) {
            currentExp.startDate = dates[0].start?.date().toISOString();
          } else if (!currentExp.endDate) {
            currentExp.endDate = dates[0].start?.date().toISOString();
          }
        }

        // Detect job title patterns
        if (/^(senior|junior|lead|principal)?\s*(software|engineer|developer|manager|analyst|designer)/i.test(line) && !currentExp.title) {
          currentExp.title = line;
          continue;
        }

        // Detect company names (usually after title)
        if (currentExp.title && !currentExp.company && line.length > 0 && !line.includes('@')) {
          currentExp.company = line;
          continue;
        }

        // If we hit a blank line and have data, save the experience
        if (line === '' && (currentExp.title || currentExp.company)) {
          if (currentExp.title || currentExp.company) {
            experiences.push(currentExp as Experience);
          }
          currentExp = {};
        } else if (line.length > 0 && currentExp.company) {
          // Description lines
          currentExp.description = (currentExp.description || '') + ' ' + line;
        }
      }
    }

    // Add last experience if exists
    if (currentExp.title || currentExp.company) {
      experiences.push(currentExp as Experience);
    }

    return experiences;
  }

  private static extractEducation(text: string): Education[] {
    const educations: Education[] = [];
    const lines = text.split('\n');

    let currentEdu: Partial<Education> = {};
    let inEducationSection = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (isEducationHeading(line)) {
        inEducationSection = true;
        continue;
      }

      if (inEducationSection) {
        // Detect degree patterns
        if (/(bachelor|master|phd|doctorate|associate|diploma)/i.test(line) && !currentEdu.degree) {
          currentEdu.degree = line;
          continue;
        }

        // Detect institution names
        if (currentEdu.degree && !currentEdu.institution && 
            (line.includes('University') || line.includes('College') || line.includes('Institute'))) {
          currentEdu.institution = line;
          continue;
        }

        // Detect graduation dates
        const dates = chrono.parse(line);
        if (dates.length > 0 && !currentEdu.graduationDate) {
          currentEdu.graduationDate = dates[0].start?.date().toISOString();
        }

        // If we hit a blank line and have data, save the education
        if (line === '' && (currentEdu.degree || currentEdu.institution)) {
          if (currentEdu.degree || currentEdu.institution) {
            educations.push(currentEdu as Education);
          }
          currentEdu = {};
        }
      }
    }

    // Add last education if exists
    if (currentEdu.degree || currentEdu.institution) {
      educations.push(currentEdu as Education);
    }

    return educations;
  }
}
