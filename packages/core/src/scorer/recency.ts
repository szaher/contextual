/**
 * Score based on recency of verification.
 * Uses commit distance as a proxy (when available) or assumes fresh.
 *
 * @param verifiedAt - commit hash when entry was last verified
 * @param isStale - whether the entry has been detected as stale
 * @returns score between 0.0 and 1.0
 */
export function scoreRecency(
  verifiedAt: string,
  isStale: boolean,
): number {
  // If explicitly marked stale, apply a penalty
  if (isStale) {
    return 0.3;
  }

  // If no verification data, assume reasonably fresh
  if (!verifiedAt) {
    return 0.5;
  }

  // If verified (not stale), give high recency score
  return 0.9;
}

/**
 * Check if an entry should be considered stale based on its verified_at value.
 * In a real implementation, this would compare against git history.
 * For now, entries with empty verified_at are considered potentially stale.
 */
export function isEntryStale(verifiedAt: string): boolean {
  return !verifiedAt || verifiedAt.trim().length === 0;
}
