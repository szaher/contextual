import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { LockInfo, LockHandle, LockOperation } from '../types/lock.js';
import { DEFAULT_LOCK_TTL_MS } from '../types/lock.js';

const LOCK_FILE = '.ctxl.lock';
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 100;

/**
 * Acquire a lock for a .ctx file. Writes lock info to .ctxl.lock YAML.
 * Retries with exponential backoff on contention.
 */
export async function acquireLock(
  repoRoot: string,
  ctxPath: string,
  holder: string,
  operation: LockOperation,
  ttlMs: number = DEFAULT_LOCK_TTL_MS,
): Promise<LockHandle> {
  const lockFilePath = join(repoRoot, LOCK_FILE);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const existing = readLockFile(lockFilePath);

    if (existing) {
      // Check if existing lock is for the same path
      if (existing.path === ctxPath) {
        // Check if expired
        if (isLockExpired(existing)) {
          // Expired — we can take over
          removeLockFile(lockFilePath);
        } else {
          // Active lock held by someone else
          if (attempt < MAX_RETRIES) {
            const delay = RETRY_BASE_MS * Math.pow(2, attempt);
            await sleep(delay);
            continue;
          }
          throw new Error(
            `Lock acquisition failed after ${MAX_RETRIES} retries. ` +
            `Lock held by ${existing.holder} for ${existing.path} ` +
            `(expires at ${existing.expires_at})`,
          );
        }
      }
      // Lock is for a different path — we can coexist (single-lock-per-file model)
      // In a real implementation we'd support multiple locks; for simplicity,
      // we use a single lock file with an array. Here we keep it simple: one lock at a time.
      if (existing.path !== ctxPath && !isLockExpired(existing)) {
        // Another path is locked — that's fine, we just need to wait if same path
        // Actually we can proceed since different path
      }
    }

    // Acquire the lock
    const now = new Date();
    const lockInfo: LockInfo = {
      path: ctxPath,
      holder,
      acquired_at: now.toISOString(),
      expires_at: new Date(now.getTime() + ttlMs).toISOString(),
      operation,
    };

    writeLockFile(lockFilePath, lockInfo);

    // Verify we actually got the lock (basic check)
    const verify = readLockFile(lockFilePath);
    if (verify && verify.holder === holder && verify.path === ctxPath) {
      return {
        lock: lockInfo,
        release: async () => {
          releaseLock(repoRoot, ctxPath, holder);
        },
      };
    }
  }

  throw new Error(`Lock acquisition failed after ${MAX_RETRIES} retries`);
}

/**
 * Release a lock for a .ctx file. Only the holder can release their own lock.
 */
export function releaseLock(repoRoot: string, ctxPath: string, holder: string): void {
  const lockFilePath = join(repoRoot, LOCK_FILE);
  const existing = readLockFile(lockFilePath);

  if (!existing) return; // No lock to release
  if (existing.path !== ctxPath) return; // Lock is for a different path
  if (existing.holder !== holder) {
    throw new Error(
      `Cannot release lock: held by ${existing.holder}, not ${holder}`,
    );
  }

  removeLockFile(lockFilePath);
}

/**
 * Check the lock status for a .ctx file path.
 * Returns the lock info if locked and not expired, null otherwise.
 */
export function checkLockStatus(repoRoot: string, ctxPath: string): LockInfo | null {
  const lockFilePath = join(repoRoot, LOCK_FILE);
  const existing = readLockFile(lockFilePath);

  if (!existing) return null;
  if (existing.path !== ctxPath) return null;
  if (isLockExpired(existing)) {
    // Clean up expired lock
    removeLockFile(lockFilePath);
    return null;
  }

  return existing;
}

/**
 * Check if any lock is currently active (for any path).
 */
export function getActiveLock(repoRoot: string): LockInfo | null {
  const lockFilePath = join(repoRoot, LOCK_FILE);
  const existing = readLockFile(lockFilePath);

  if (!existing) return null;
  if (isLockExpired(existing)) {
    removeLockFile(lockFilePath);
    return null;
  }

  return existing;
}

/**
 * Check if a lock is expired based on its expires_at timestamp.
 */
export function isLockExpired(lock: LockInfo): boolean {
  return new Date(lock.expires_at).getTime() < Date.now();
}

// --- Internal helpers ---

function readLockFile(lockFilePath: string): LockInfo | null {
  if (!existsSync(lockFilePath)) return null;

  try {
    const content = readFileSync(lockFilePath, 'utf-8').trim();
    if (!content) return null;

    // Simple YAML-like parsing for lock file
    const lines = content.split('\n');
    const data: Record<string, string> = {};
    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim().replace(/^"(.*)"$/, '$1');
      data[key] = value;
    }

    if (!data.path || !data.holder || !data.acquired_at || !data.expires_at) {
      return null;
    }

    return {
      path: data.path,
      holder: data.holder,
      acquired_at: data.acquired_at,
      expires_at: data.expires_at,
      operation: (data.operation as LockOperation) || 'update',
    };
  } catch {
    return null;
  }
}

function writeLockFile(lockFilePath: string, lock: LockInfo): void {
  const dir = dirname(lockFilePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const content = [
    `path: "${lock.path}"`,
    `holder: "${lock.holder}"`,
    `acquired_at: "${lock.acquired_at}"`,
    `expires_at: "${lock.expires_at}"`,
    `operation: "${lock.operation}"`,
  ].join('\n');

  writeFileSync(lockFilePath, content + '\n', 'utf-8');
}

function removeLockFile(lockFilePath: string): void {
  try {
    unlinkSync(lockFilePath);
  } catch {
    // Ignore if already removed
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ensure .ctxl.lock is listed in the repository's .gitignore.
 * If .gitignore doesn't exist or doesn't contain .ctxl.lock, appends it.
 */
export function ensureLockInGitignore(repoRoot: string): void {
  const gitignorePath = join(repoRoot, '.gitignore');

  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf-8');
    if (content.includes('.ctxl.lock')) return;
    // Append .ctxl.lock
    const separator = content.endsWith('\n') ? '' : '\n';
    writeFileSync(gitignorePath, content + separator + '.ctxl.lock\n', 'utf-8');
  } else {
    writeFileSync(gitignorePath, '# ctxl lock files\n.ctxl.lock\n', 'utf-8');
  }
}
