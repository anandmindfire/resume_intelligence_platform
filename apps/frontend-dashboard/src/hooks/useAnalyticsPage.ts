import { useState, useEffect, useCallback } from 'react';
import { analyticsService } from '../services/analyticsService';
import type { SkillCount, ExperienceStats, EducationStats, RoleMatch } from '../types';

const DEFAULT_TOP_SKILLS = 15;
const DEFAULT_MATCHES_PAGE_SIZE = 10;

export function useAnalyticsPage() {
  const [skills, setSkills] = useState<SkillCount[]>([]);
  const [experience, setExperience] = useState<ExperienceStats | null>(null);
  const [education, setEducation] = useState<EducationStats[]>([]);
  const [matches, setMatches] = useState<RoleMatch[]>([]);
  const [uniqueRoles, setUniqueRoles] = useState<{ id: string; title: string }[]>([]);
  const [matchesTotal, setMatchesTotal] = useState(0);
  const [matchesPage, setMatchesPage] = useState(1);
  const [matchesTotalPages, setMatchesTotalPages] = useState(0);
  const [matchesLimit, setMatchesLimit] = useState(DEFAULT_MATCHES_PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [minScore, setMinScore] = useState(0);

  const loadCharts = useCallback(async () => {
    const [skillsResult, expResult, eduResult] = await Promise.allSettled([
      analyticsService.getTopSkills(DEFAULT_TOP_SKILLS),
      analyticsService.getExperienceStats(),
      analyticsService.getEducationStats(),
    ]);
    if (skillsResult.status === 'fulfilled') setSkills(skillsResult.value ?? []);
    if (expResult.status === 'fulfilled') setExperience(expResult.value ?? null);
    if (eduResult.status === 'fulfilled') setEducation(eduResult.value ?? []);
    return [skillsResult, expResult, eduResult].every((r) => r.status === 'rejected');
  }, []);

  const loadMatches = useCallback(async () => {
    setMatchesLoading(true);
    try {
      const result = await analyticsService.getRoleMatches(
        selectedRole || undefined,
        minScore,
        matchesPage,
        matchesLimit
      );
      setMatches(result.data);
      setUniqueRoles(result.uniqueRoles ?? []);
      setMatchesTotal(result.total);
      setMatchesTotalPages(result.totalPages);
    } catch (err) {
      console.error('Failed to load matches:', err);
    } finally {
      setMatchesLoading(false);
    }
  }, [selectedRole, minScore, matchesPage, matchesLimit]);

  const loadAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const allRejected = await loadCharts();
      if (allRejected) setError('Failed to load analytics data. Please check your connection and try again.');
    } catch (err) {
      console.error('Unexpected error loading analytics:', err);
      setError('An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  }, [loadCharts]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  useEffect(() => {
    if (!loading) loadMatches();
  }, [loadMatches, loading]);

  const setMatchesPageHandler = useCallback((page: number) => {
    setMatchesPage(page);
  }, []);

  const setMatchesPageSizeHandler = useCallback((limit: number) => {
    setMatchesLimit(limit);
    setMatchesPage(1);
  }, []);

  const handleRoleFilterChange = useCallback((roleId: string) => {
    setSelectedRole(roleId);
    setMatchesPage(1);
  }, []);

  const handleMinScoreChange = useCallback((score: number) => {
    setMinScore(score);
    setMatchesPage(1);
  }, []);

  return {
    skills,
    experience,
    education,
    matches,
    uniqueRoles,
    matchesTotal,
    matchesPage,
    matchesTotalPages,
    matchesLimit,
    selectedRole,
    setSelectedRole: handleRoleFilterChange,
    minScore,
    setMinScore: handleMinScoreChange,
    setMatchesPage: setMatchesPageHandler,
    setMatchesPageSize: setMatchesPageSizeHandler,
    loading,
    matchesLoading,
    error,
    loadAnalytics,
  };
}
