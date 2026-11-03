import React from 'react';
import { Card, Pagination, StatCard } from '../components/common';
import { StatCardSkeleton, ChartSkeleton, TableSkeleton } from '../components/skeletons';
import { EmptyState } from '../components/common';
import { SkillsPieChart, EducationBarChart, ExperienceChart } from '../charts';
import { formatMatchScore, formatNumber, normalizeMatchScore } from '../utils/formatters';
import { TrendingUp, Award, GraduationCap, Target, AlertTriangle } from 'lucide-react';
import { useAnalyticsPage } from '../hooks/useAnalyticsPage';
import { COPY } from '../constants';

export const Analytics: React.FC = () => {
  const {
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
    setSelectedRole,
    minScore,
    setMinScore,
    setMatchesPage,
    setMatchesPageSize,
    loading,
    matchesLoading,
    error,
    loadAnalytics,
  } = useAnalyticsPage();

  if (error) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-[50vh] space-y-4 text-center"
        role="alert"
      >
        <div className="bg-danger-50 p-4 rounded-full">
          <AlertTriangle className="w-12 h-12 text-danger-500" />
        </div>
        <h2 className="text-2xl font-bold text-neutral-800">{COPY.ERRORS.SOMETHING_WRONG}</h2>
        <p className="text-neutral-600">{error}</p>
        <button
          onClick={loadAnalytics}
          className="px-4 py-2 bg-info-600 text-white rounded-lg hover:bg-info-700 transition"
        >
          {COPY.LABELS.RETRY}
        </button>
      </div>
    );
  }

  return (
    <div className={`space-y-8 font-sans ${!loading ? 'animate-fade-in' : ''}`}>
      <div className="mb-8 text-center md:text-left">
        <h1 className="text-5xl font-bold font-display text-white mb-3 drop-shadow-lg">
          {COPY.PAGES.ANALYTICS.TITLE}
        </h1>
        <p className="text-white/90 text-xl font-medium">{COPY.PAGES.ANALYTICS.SUBTITLE}</p>
      </div>

      <div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
        aria-live="polite"
        aria-busy={loading}
      >
        {loading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard
              title={COPY.STATS.AVG_EXPERIENCE}
              value={
                experience?.avg_years != null ? `${Number(experience.avg_years).toFixed(1)}` : '-'
              }
              label={COPY.STATS.YEARS_EXPERIENCE}
              icon={TrendingUp}
              variant="info"
            />
            <StatCard
              title={COPY.STATS.TOP_SKILLS}
              value={skills.length}
              label={COPY.STATS.UNIQUE_SKILLS}
              icon={Award}
              variant="warning"
            />
            <StatCard
              title={COPY.STATS.UNIVERSITIES}
              value={education.length}
              label={COPY.STATS.UNIQUE_INSTITUTIONS}
              icon={GraduationCap}
              variant="accent"
            />
            <StatCard
              title={COPY.STATS.ROLE_MATCHES}
              value={formatNumber(matchesTotal)}
              label={COPY.STATS.TOTAL_MATCHES}
              icon={Target}
              variant="secondary"
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card
          title={COPY.CHARTS.TOP_SKILLS_DIST}
          description={COPY.CHARTS.TOP_SKILLS_DESC}
          className="animate-slide-up"
          style={{ animationDelay: '400ms' }}
        >
          {loading ? (
            <ChartSkeleton height={260} />
          ) : skills?.length > 0 ? (
            <>
              <p className="sr-only">
                {`Pie chart of the top ${Math.min(skills.length, 10)} skills by resume count: ${skills
                  .slice(0, 10)
                  .map((s) => `${s.skill} (${s.count})`)
                  .join(', ')}.`}
              </p>
              <SkillsPieChart data={skills} limit={10} />
            </>
          ) : (
            <EmptyState icon="📊" title={COPY.EMPTY.NO_SKILLS} />
          )}
        </Card>

        <Card
          title={COPY.CHARTS.TOP_UNIVERSITIES}
          description={COPY.CHARTS.TOP_UNIVERSITIES_DESC}
          className="animate-slide-up"
          style={{ animationDelay: '500ms' }}
        >
          {loading ? (
            <ChartSkeleton height={260} />
          ) : education?.length > 0 ? (
            <>
              <p className="sr-only">
                {`Bar chart of the top ${Math.min(education.length, 10)} universities by resume count: ${education
                  .slice(0, 10)
                  .map((e) => `${e.institution} (${e.count})`)
                  .join(', ')}.`}
              </p>
              <EducationBarChart data={education} />
            </>
          ) : (
            <EmptyState icon="🎓" title={COPY.EMPTY.NO_EDUCATION} />
          )}
        </Card>
      </div>

      {!loading &&
        experience &&
        (Number(experience.max_years) > 0 || Number(experience.avg_years) > 0) && (
          <Card
            title={COPY.CHARTS.EXPERIENCE_STATS}
            description={COPY.CHARTS.EXPERIENCE_STATS_DESC}
            className="animate-slide-up"
            style={{ animationDelay: '600ms' }}
          >
            <p className="sr-only">
              {`Bar chart of experience statistics: average ${Number(experience.avg_years).toFixed(1)} years, minimum ${Number(experience.min_years).toFixed(1)} years, maximum ${Number(experience.max_years).toFixed(1)} years.`}
            </p>
            <ExperienceChart data={experience} />
          </Card>
        )}

      <Card
        title={COPY.CHARTS.ROLE_MATCHES}
        description={COPY.CHARTS.ROLE_MATCHES_DESC}
        className="animate-slide-up"
        style={{ animationDelay: '700ms' }}
      >
        <div className="mb-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label
              htmlFor="analytics-role-filter"
              className="block text-sm font-semibold text-neutral-700 mb-2"
            >
              {COPY.LABELS.FILTER_BY_ROLE}
            </label>
            <select
              id="analytics-role-filter"
              className="input max-w-xs w-full border-neutral-300 rounded-md focus:ring-info-500 focus:border-info-500"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
            >
              <option value="">{COPY.LABELS.ALL_ROLES}</option>
              {uniqueRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="analytics-min-score"
              className="block text-sm font-semibold text-neutral-700 mb-2"
            >
              {COPY.LABELS.MIN_MATCH_SCORE}
            </label>
            <input
              id="analytics-min-score"
              type="number"
              className="input max-w-xs w-full"
              min={0}
              max={100}
              placeholder="0"
              value={minScore}
              onChange={(e) => setMinScore(parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>

        {matchesLoading ? (
          <TableSkeleton variant="matches" rowCount={8} />
        ) : matches.length > 0 ? (
          <>
            <div className="overflow-x-auto rounded-lg border border-neutral-200">
              <table className="table w-full">
                <thead>
                  <tr className="bg-neutral-50">
                    <th className="px-4 py-3 text-left">{COPY.LABELS.ROLE}</th>
                    <th className="px-4 py-3 text-left">{COPY.LABELS.RESUME}</th>
                    <th className="px-4 py-3 text-left">{COPY.LABELS.MATCH_SCORE}</th>
                    <th className="px-4 py-3 text-left">{COPY.LABELS.MATCHED_SKILLS}</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map((match, index) => {
                    const score = normalizeMatchScore(match.match_score);
                    const scoreClass =
                      score >= 70
                        ? 'match-score-high'
                        : score >= 50
                          ? 'match-score-medium'
                          : 'match-score-low';
                    return (
                      <tr key={index} className="border-t hover:bg-neutral-50 transition-colors">
                        <td className="px-4 py-3 font-semibold text-neutral-800">
                          {match.role_title || '-'}
                        </td>
                        <td className="px-4 py-3 text-neutral-600 font-medium">
                          {match.name || match.file_name || 'Unknown Candidate'}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`match-score ${scoreClass} px-2 py-1 rounded text-sm font-bold`}
                          >
                            {formatMatchScore(match.match_score)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {(match.matched_skills || []).slice(0, 3).map((skill, idx) => (
                              <span
                                key={idx}
                                className="skill-tag text-xs bg-info-100 text-info-800 px-2 py-1 rounded"
                              >
                                {skill}
                              </span>
                            ))}
                            {(match.matched_skills || []).length > 3 && (
                              <span className="skill-tag text-xs bg-neutral-100 text-neutral-600 px-2 py-1 rounded opacity-70">
                                +{(match.matched_skills || []).length - 3}
                              </span>
                            )}
                            {(!match.matched_skills || match.matched_skills.length === 0) && (
                              <span className="text-neutral-400 text-xs italic">
                                {COPY.LABELS.NO_SKILLS_MATCHED}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {matchesTotalPages > 1 && (
              <Pagination
                page={matchesPage}
                totalPages={matchesTotalPages}
                total={matchesTotal}
                limit={matchesLimit}
                onPageChange={setMatchesPage}
                onPageSizeChange={setMatchesPageSize}
                pageSizeOptions={[5, 10, 20, 50]}
                showPageSize={true}
              />
            )}
          </>
        ) : (
          <EmptyState
            icon="🎯"
            title={COPY.EMPTY.NO_ROLE_MATCHES}
            message={
              selectedRole ? COPY.EMPTY.NO_ROLE_MATCHES_FILTER : COPY.EMPTY.NO_ROLE_MATCHES_YET
            }
          />
        )}
      </Card>
    </div>
  );
};
