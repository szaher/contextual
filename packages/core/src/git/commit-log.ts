import { execFileSync } from 'node:child_process';
import type { CommitContextRecord } from './types.js';
import { parseTrailers } from './trailer-parser.js';

export interface CommitLogOptions {
  since?: string;
  until?: string;
  limit?: number;
  sessionId?: string;
}

const COMMIT_SEPARATOR = '---CTXKIT-COMMIT-SEP---';
const FIELD_SEPARATOR = '---CTXKIT-FIELD-SEP---';

/**
 * Query git log and extract commits that contain Ctxkit-* trailers.
 */
export function queryCommitsWithTrailers(
  cwd: string,
  options: CommitLogOptions = {},
): CommitContextRecord[] {
  const args: string[] = [
    'log',
    `--format=%H${FIELD_SEPARATOR}%s${FIELD_SEPARATOR}%an <%ae>${FIELD_SEPARATOR}%B${COMMIT_SEPARATOR}`,
  ];

  if (options.since) args.push(`--since=${options.since}`);
  if (options.until) args.push(`--until=${options.until}`);
  if (options.limit) args.push('-n', String(options.limit));
  if (options.sessionId) args.push(`--grep=Ctxkit-Session: ${options.sessionId}`);

  let output: string;
  try {
    output = execFileSync('git', args, {
      cwd,
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    return [];
  }

  if (!output.trim()) return [];

  const commits = output.split(COMMIT_SEPARATOR).filter((s) => s.trim());
  const results: CommitContextRecord[] = [];

  for (const commitBlock of commits) {
    const fields = commitBlock.split(FIELD_SEPARATOR);
    if (fields.length < 4) continue;

    const hash = fields[0].trim();
    const subject = fields[1].trim();
    const author = fields[2].trim();
    const body = fields.slice(3).join(FIELD_SEPARATOR).trim();

    const parsed = parseTrailers(body);
    if (!parsed) continue;

    // If filtering by sessionId, double-check it matches
    if (options.sessionId && parsed.sessionId !== options.sessionId) continue;

    results.push({
      commitHash: hash,
      sessionId: parsed.sessionId,
      filesChanged: parsed.files,
      entryCount: parsed.entries ?? 0,
      trailerTimestamp: parsed.timestamp,
      author,
      messageSubject: subject,
    });
  }

  return results;
}
