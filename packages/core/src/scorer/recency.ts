import { execFileSync } from 'node:child_process';

const HALF_LIFE_DAYS = 30;
const FLOOR = 0.3;
const LAMBDA = Math.LN2 / HALF_LIFE_DAYS;

/** Module-level cache: git hash -> days since commit */
const hashDateCache = new Map<string, number>();

/**
 * Compute exponential decay score from days since verification.
 * Returns a value between FLOOR and 1.0.
 */
function computeDecayScore(daysSince: number): number {
  if (daysSince < 0) return 1.0;
  return FLOOR + (1.0 - FLOOR) * Math.exp(-LAMBDA * daysSince);
}

/**
 * Resolve a git commit hash to number of days since that commit.
 * Uses a module-level cache to avoid repeated git lookups.
 */
function resolveHashToDays(hash: string, repoRoot: string): number | null {
  const cacheKey = `${repoRoot}:${hash}`;
  if (hashDateCache.has(cacheKey)) {
    return hashDateCache.get(cacheKey)!;
  }
  try {
    const dateStr = execFileSync(
      'git',
      ['show', '-s', '--format=%ci', hash],
      { cwd: repoRoot, encoding: 'utf-8' },
    ).trim();
    const commitDate = new Date(dateStr);
    const now = new Date();
    const daysSince = (now.getTime() - commitDate.getTime()) / (1000 * 60 * 60 * 24);
    hashDateCache.set(cacheKey, daysSince);
    return daysSince;
  } catch {
    return null;
  }
}

const GIT_HASH_RE = /^[a-f0-9]{4,40}$/;

/**
 * Score based on recency of verification using exponential time-decay.
 *
 * @param verifiedAt - commit hash or ISO 8601 date when entry was last verified
 * @param repoRoot - repository root for resolving git hashes (optional)
 * @returns score between FLOOR (0.3) and 1.0
 */
export function scoreRecency(
  verifiedAt: string,
  repoRoot?: string,
): number {
  if (!verifiedAt || verifiedAt.trim().length === 0) {
    return FLOOR;
  }

  const value = verifiedAt.trim();

  // Check if value is a git hash
  if (GIT_HASH_RE.test(value)) {
    if (repoRoot) {
      const daysSince = resolveHashToDays(value, repoRoot);
      if (daysSince !== null) {
        return Math.round(computeDecayScore(daysSince) * 100) / 100;
      }
    }
    // If no repoRoot or git lookup failed, return floor
    return FLOOR;
  }

  // Try parsing as ISO 8601 date
  const parsed = new Date(value);
  if (!isNaN(parsed.getTime())) {
    const now = new Date();
    const daysSince = (now.getTime() - parsed.getTime()) / (1000 * 60 * 60 * 24);
    return Math.round(computeDecayScore(daysSince) * 100) / 100;
  }

  // Unrecognized format
  return FLOOR;
}

/**
 * Check if an entry should be considered stale based on its verified_at value.
 * Entries with empty verified_at are considered potentially stale.
 */
export function isEntryStale(verifiedAt: string): boolean {
  return !verifiedAt || verifiedAt.trim().length === 0;
}
