import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { parseCtxFile } from '../ctx/parser.js';


export interface StaleEntry {
  section: string;
  entry_id: string;
  verified_at: string;
  current_commit: string;
  reason: 'file_deleted' | 'file_renamed' | 'file_modified' | 'commit_unknown';
  details: string;
}

export interface DriftResult {
  ctx_path: string;
  stale_entries: StaleEntry[];
  total_stale: number;
}

/**
 * Detect drift for a single .ctx file by checking if referenced files
 * have changed since their verified_at commit.
 */
export function detectDrift(ctxPath: string, repoRoot: string): DriftResult {
  const relCtxPath = relative(repoRoot, ctxPath);
  const stale_entries: StaleEntry[] = [];

  if (!existsSync(ctxPath)) {
    return { ctx_path: relCtxPath, stale_entries, total_stale: 0 };
  }

  const content = readFileSync(ctxPath, 'utf-8');
  const ctx = parseCtxFile(content);
  const currentCommit = getCurrentCommit(repoRoot);

  // Check key_files
  for (const kf of ctx.key_files) {
    const entry = checkEntryDrift(kf.path, kf.verified_at, currentCommit, repoRoot, ctxPath);
    if (entry) {
      stale_entries.push({ ...entry, section: 'key_files', entry_id: kf.path });
    }
  }

  // Check contracts (scope paths)
  for (const contract of ctx.contracts) {
    const entry = checkVerifiedAt(contract.name, contract.verified_at, currentCommit, repoRoot);
    if (entry) {
      stale_entries.push({ ...entry, section: 'contracts', entry_id: contract.name });
    }
  }

  // Check decisions
  for (const decision of ctx.decisions) {
    const entry = checkVerifiedAt(decision.id, decision.verified_at, currentCommit, repoRoot);
    if (entry) {
      stale_entries.push({ ...entry, section: 'decisions', entry_id: decision.id });
    }
  }

  return {
    ctx_path: relCtxPath,
    stale_entries,
    total_stale: stale_entries.length,
  };
}

/**
 * Detect drift for all .ctx files in a repository.
 */
export function detectAllDrift(repoRoot: string): DriftResult[] {
  const ctxFiles = findAllCtxFiles(repoRoot);
  return ctxFiles.map((ctxPath) => detectDrift(ctxPath, repoRoot));
}

/**
 * Check if a specific file has drifted since its verified_at commit.
 */
function checkEntryDrift(
  filePath: string,
  verifiedAt: string,
  currentCommit: string,
  repoRoot: string,
  ctxPath: string,
): Omit<StaleEntry, 'section' | 'entry_id'> | null {
  const ctxDir = dirname(ctxPath);
  const absPath = resolve(ctxDir, filePath);
  const relPath = relative(repoRoot, absPath);

  // Check if file exists
  if (!existsSync(absPath)) {
    // Try to detect if it was renamed
    const renamed = detectRename(relPath, verifiedAt, repoRoot);
    if (renamed) {
      return {
        verified_at: verifiedAt,
        current_commit: currentCommit,
        reason: 'file_renamed',
        details: `renamed to ${renamed}`,
      };
    }
    return {
      verified_at: verifiedAt,
      current_commit: currentCommit,
      reason: 'file_deleted',
      details: `File ${relPath} no longer exists`,
    };
  }

  // Check if file was modified since verified_at
  if (verifiedAt && verifiedAt.length > 0) {
    try {
      const hasChanges = execSync(
        `git log --oneline ${verifiedAt}..HEAD -- "${relPath}" 2>/dev/null | head -1`,
        { cwd: repoRoot, encoding: 'utf-8' },
      ).trim();

      if (hasChanges) {
        return {
          verified_at: verifiedAt,
          current_commit: currentCommit,
          reason: 'file_modified',
          details: `File modified since ${verifiedAt}`,
        };
      }
    } catch {
      // If the commit is unknown, flag it
      return {
        verified_at: verifiedAt,
        current_commit: currentCommit,
        reason: 'commit_unknown',
        details: `Cannot find commit ${verifiedAt}`,
      };
    }
  }

  return null;
}

/**
 * Check if a verified_at commit is still the latest (for non-file entries).
 */
function checkVerifiedAt(
  entryId: string,
  verifiedAt: string,
  currentCommit: string,
  repoRoot: string,
): Omit<StaleEntry, 'section' | 'entry_id'> | null {
  if (!verifiedAt || verifiedAt.length === 0) {
    return null;
  }

  try {
    // Check if the commit exists
    execSync(`git cat-file -t ${verifiedAt} 2>/dev/null`, {
      cwd: repoRoot,
      encoding: 'utf-8',
    });
  } catch {
    return {
      verified_at: verifiedAt,
      current_commit: currentCommit,
      reason: 'commit_unknown',
      details: `Cannot verify commit ${verifiedAt} for ${entryId}`,
    };
  }

  return null;
}

function getCurrentCommit(repoRoot: string): string {
  try {
    return execSync('git rev-parse --short HEAD 2>/dev/null', {
      cwd: repoRoot,
      encoding: 'utf-8',
    }).trim();
  } catch {
    return 'unknown';
  }
}

function detectRename(filePath: string, sinceCommit: string, repoRoot: string): string | null {
  if (!sinceCommit) return null;
  try {
    const output = execSync(
      `git log --follow --diff-filter=R --format="" --name-only ${sinceCommit}..HEAD -- "${filePath}" 2>/dev/null | head -1`,
      { cwd: repoRoot, encoding: 'utf-8' },
    ).trim();
    return output || null;
  } catch {
    return null;
  }
}

function findAllCtxFiles(repoRoot: string): string[] {
  try {
    const output = execSync(
      'find . -name ".ctx" -not -path "*/node_modules/*" -not -path "*/.git/*" 2>/dev/null',
      { cwd: repoRoot, encoding: 'utf-8' },
    ).trim();
    if (!output) return [];
    return output.split('\n').map((p) => resolve(repoRoot, p));
  } catch {
    return [];
  }
}
