import type { ParsedTrailer } from './types.js';

const TRAILER_PATTERN = /^Ctxkit-([A-Za-z]+):\s+(.+)$/;

/**
 * Parse Ctxkit-* trailers from a commit message.
 * Returns null if no Ctxkit-* trailers are found.
 */
export function parseTrailers(commitMessage: string): ParsedTrailer | null {
  const lines = commitMessage.split('\n');

  let sessionId: string | null = null;
  let files: string[] = [];
  let entries: number | null = null;
  let timestamp: string | null = null;
  let found = false;

  for (const line of lines) {
    const match = line.match(TRAILER_PATTERN);
    if (!match) continue;

    const key = match[1];
    const value = match[2].trim();
    found = true;

    switch (key) {
      case 'Session':
        sessionId = value;
        break;
      case 'Files':
        files = value.split(', ').map((f) => f.trim()).filter(Boolean);
        break;
      case 'Entries':
        entries = parseInt(value, 10);
        if (isNaN(entries)) entries = null;
        break;
      case 'Timestamp':
        timestamp = value;
        break;
    }
  }

  if (!found || !timestamp) {
    return null;
  }

  return { sessionId, files, entries, timestamp };
}
