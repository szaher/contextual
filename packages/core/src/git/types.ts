/**
 * Data used to format Ctxkit-* git trailers into commit messages.
 */
export interface TrailerData {
  sessionId?: string;
  files?: string[];
  entries?: number;
  timestamp: string;
}

/**
 * Parsed representation of Ctxkit-* trailers extracted from a commit message.
 */
export interface ParsedTrailer {
  sessionId: string | null;
  files: string[];
  entries: number | null;
  timestamp: string;
}

/**
 * A commit with parsed context trailer data, stored in the daemon's SQLite database.
 */
export interface CommitContextRecord {
  commitHash: string;
  sessionId: string | null;
  filesChanged: string[];
  entryCount: number;
  trailerTimestamp: string;
  author: string;
  messageSubject: string;
  indexedAt?: string;
}

/**
 * Hook installation policy for auto-install behavior.
 */
export type HookPolicyMode = 'auto' | 'prompt' | 'skip';

export interface HookPolicy {
  mode: HookPolicyMode;
  installedAt: string | null;
  declinedAt: string | null;
  hookVersion: string | null;
}

/**
 * Status of a single hook file.
 */
export type HookFileStatus = 'installed' | 'outdated' | 'not_installed' | 'chained';

/**
 * Read-only status returned by `ctxkit hooks status`.
 */
export interface HookInstallStatus {
  prepareCommitMsg: HookFileStatus;
  preCommit: HookFileStatus;
  postCommit: HookFileStatus;
  hasOtherHooks: boolean;
}
