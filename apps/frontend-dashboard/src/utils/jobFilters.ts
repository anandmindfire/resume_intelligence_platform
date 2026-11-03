import type { Job } from '../types';

export interface JobFilterCriteria {
  searchQuery: string;
  domainFilter: string;
  locationFilter: string;
}

/** Filters jobs by free-text search (title/domain/skills), domain and location. */
export function filterJobs(
  jobs: Job[],
  { searchQuery, domainFilter, locationFilter }: JobFilterCriteria
): Job[] {
  const query = searchQuery.toLowerCase();
  return jobs.filter((job) => {
    const matchesSearch =
      query === '' ||
      job.title.toLowerCase().includes(query) ||
      job.domain.toLowerCase().includes(query) ||
      job.skills.some((s) => s.toLowerCase().includes(query));
    const matchesDomain = domainFilter === 'all' || job.domain === domainFilter;
    const matchesLocation =
      locationFilter === 'all' || job.location.toLowerCase().includes(locationFilter.toLowerCase());
    return matchesSearch && matchesDomain && matchesLocation;
  });
}
