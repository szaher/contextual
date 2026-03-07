/**
 * Score based on tag matching between request keywords and entry tags.
 * Returns TAG_MATCH score proportional to the fraction of tags matched.
 *
 * @param requestKeywords - keywords extracted from the request text
 * @param entryTags - tags from the .ctx entry
 * @returns score between 0.0 and 1.0
 */
export function scoreTags(
  requestKeywords: string[],
  entryTags: string[],
): number {
  if (entryTags.length === 0 || requestKeywords.length === 0) {
    return 0.0;
  }

  const normalizedKeywords = new Set(
    requestKeywords.map((k) => k.toLowerCase().trim()),
  );
  const normalizedTags = entryTags.map((t) => t.toLowerCase().trim());

  let matches = 0;
  for (const tag of normalizedTags) {
    if (normalizedKeywords.has(tag)) {
      // Exact match: +1.0, skip partial matching for this tag
      matches++;
      continue;
    }
    // Partial match: cap contribution per tag to 0.5
    let partialContribution = 0;
    for (const keyword of normalizedKeywords) {
      if (keyword !== tag && (keyword.includes(tag) || tag.includes(keyword))) {
        partialContribution = 0.5;
        break;
      }
    }
    matches += partialContribution;
  }

  // Score is the ratio of matched tags to total tags, capped at 1.0
  const score = Math.min(1.0, matches / entryTags.length);

  return Math.round(score * 100) / 100;
}

/**
 * Extract keywords from a request text for tag matching.
 * Simple tokenization: split on whitespace and punctuation, filter short words.
 */
export function extractKeywords(requestText: string): string[] {
  return requestText
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .filter(
      (word) =>
        !STOP_WORDS.has(word),
    );
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all',
  'can', 'has', 'her', 'was', 'one', 'our', 'out', 'its',
  'his', 'how', 'did', 'get', 'let', 'say', 'she', 'too',
  'use', 'way', 'who', 'had', 'may', 'any', 'new', 'now',
  'old', 'see', 'own', 'put', 'run', 'set', 'try', 'ask',
  'few', 'got', 'why', 'big', 'end', 'off', 'yes', 'yet',
  'far', 'low', 'lot', 'much', 'take', 'make', 'like',
  'just', 'know', 'time', 'very', 'when', 'come', 'also',
  'back', 'been', 'call', 'each', 'from', 'have', 'here',
  'into', 'keep', 'last', 'long', 'look', 'more', 'most',
  'must', 'need', 'only', 'over', 'such', 'than', 'that',
  'them', 'then', 'they', 'this', 'want', 'well', 'what',
  'will', 'with', 'would', 'could', 'should', 'about',
  'after', 'being', 'doing', 'going', 'where', 'which',
  'while', 'their', 'there', 'these', 'those', 'other',
  'some', 'work', 'does',
]);
