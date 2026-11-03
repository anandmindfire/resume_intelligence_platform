import { JobRole, MatchResult } from '../models';
import { ExtractedResume, Experience } from '@resume-platform/resume-nlp';

export class RoleMatcher {
  static match(resume: ExtractedResume, role: JobRole): MatchResult {
    const skillScore = this.calculateSkillScore(resume.skills, role);
    const keywordScore = this.calculateKeywordScore(resume.rawText, role);
    const experienceScore = this.calculateExperienceScore(resume.experience, role);

    // Weighted overall score: 50% Skills, 40% Experience, 10% Keywords.
    // The experience bonus can push the raw sum above 1 (up to 1.08); a match percentage never exceeds 100.
    const overallScore = Math.min(
      skillScore * 0.5 + experienceScore * 0.4 + keywordScore * 0.1,
      1
    );

    const matchedSkills = resume.skills.filter(resumeSkill =>
      [...role.requiredSkills, ...role.preferredSkills].some(roleSkill => {
        const regex = new RegExp(`\\b${this.escapeRegExp(roleSkill)}\\b`, 'i');
        return regex.test(resumeSkill);
      })
    );

    const missingSkills = role.requiredSkills.filter(required =>
      !resume.skills.some(resumeSkill => {
        const regex = new RegExp(`\\b${this.escapeRegExp(required)}\\b`, 'i');
        return regex.test(resumeSkill);
      })
    );

    const totalExperience = this.calculateTotalExperience(resume.experience);
    const experienceMatch = role.requiredExperience
      ? totalExperience >= role.requiredExperience
      : true;

    return {
      roleId: role.id,
      roleTitle: role.title,
      matchScore: Math.round(overallScore * 10000) / 100, // Score out of 100
      matchedSkills,
      missingSkills,
      experienceMatch,
      details: {
        skillScore: Math.round(skillScore * 10000) / 100,
        keywordScore: Math.round(keywordScore * 10000) / 100,
        experienceScore: Math.round(experienceScore * 10000) / 100,
      },
    };
  }

  private static calculateSkillScore(skills: string[], role: JobRole): number {
    if (role.requiredSkills.length === 0 && role.preferredSkills.length === 0) {
      return 1.0;
    }

    const matchedRequired = role.requiredSkills.filter(required =>
      skills.some(skill => new RegExp(`\\b${this.escapeRegExp(required)}\\b`, 'i').test(skill))
    ).length;

    const matchedPreferred = role.preferredSkills.filter(preferred =>
      skills.some(skill => new RegExp(`\\b${this.escapeRegExp(preferred)}\\b`, 'i').test(skill))
    ).length;

    const requiredScore = role.requiredSkills.length > 0
      ? matchedRequired / role.requiredSkills.length
      : 1.0;

    const preferredScore = role.preferredSkills.length > 0
      ? matchedPreferred / role.preferredSkills.length
      : 1.0;

    // Weight: 80% required, 20% preferred
    return requiredScore * 0.8 + preferredScore * 0.2;
  }

  private static calculateKeywordScore(text: string, role: JobRole): number {
    if (role.keywords.length === 0) return 1.0;

    const matchedKeywords = role.keywords.filter(keyword =>
      new RegExp(`\\b${this.escapeRegExp(keyword)}\\b`, 'i').test(text)
    ).length;

    return matchedKeywords / role.keywords.length;
  }

  private static calculateExperienceScore(experience: Experience[], role: JobRole): number {
    if (!role.requiredExperience) return 1.0;

    const totalExperience = this.calculateTotalExperience(experience);

    if (totalExperience >= role.requiredExperience) {
      // Bonus for exceeding experience, up to 120%
      return Math.min(1.0 + (totalExperience - role.requiredExperience) * 0.05, 1.2);
    }

    // Penalty for missing experience: non-linear (missing 1 year when 5 required is worse than 1 when 10 required)
    const gap = role.requiredExperience - totalExperience;
    return Math.max(1.0 - (gap / role.requiredExperience) * 1.5, 0);
  }

  private static calculateTotalExperience(experience: Experience[]): number {
    if (!experience || experience.length === 0) return 0;

    return experience.reduce((total, exp) => {
      const duration = exp.duration || '';
      return total + this.parseDurationToYears(duration);
    }, 0);
  }

  private static parseDurationToYears(durationStr: string): number {
    const str = durationStr.toLowerCase().trim();
    if (!str) return 0;

    if (str.includes('less than 1 year')) return 0.5;

    let years = 0;
    const yearMatch = str.match(/(\d+(\.\d+)?)\s*years?/);
    if (yearMatch) {
      years = parseFloat(yearMatch[1]);
    }

    const monthMatch = str.match(/(\d+)\s*months?/);
    if (monthMatch) {
      years += parseInt(monthMatch[1], 10) / 12;
    }

    // If no matches but a number exists at start, assume years (e.g. "2")
    const leadingNumber = str.match(/^\d+(\.\d+)?/);
    if (years === 0 && leadingNumber) {
      years = parseFloat(leadingNumber[0]);
    }

    return years;
  }

  private static escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
