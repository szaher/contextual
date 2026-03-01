/**
 * Shared hook utilities for the Claude Code plugin.
 *
 * Provides: stdin JSON reader, stdout JSON writer, graceful error handler,
 * timeout enforcement, non-git-directory detection, and daemon client re-export.
 */

import { execSync } from 'node:child_process';
import type { HookInputBase, HookOutput } from '@ctxl/core';

export type { HookInputBase, HookOutput } from '@ctxl/core';

/** Default timeout for hook handlers in milliseconds. */
const DEFAULT_HOOK_TIMEOUT_MS = 10_000;

/**
 * Read JSON input from stdin (used by all hook handlers).
 * Claude Code pipes hook input as a single JSON blob on stdin.
 */
export async function readStdinJson<T extends HookInputBase>(): Promise<T> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      try {
        resolve(JSON.parse(data) as T);
      } catch (err) {
        reject(new Error(`Failed to parse stdin JSON: ${err}`));
      }
    });
    process.stdin.on('error', reject);
    process.stdin.resume();
  });
}

/**
 * Write JSON output to stdout (used by all hook handlers).
 * Claude Code reads the hook response from stdout.
 */
export function writeStdoutJson(output: HookOutput): void {
  process.stdout.write(JSON.stringify(output) + '\n');
}

/**
 * Write an empty success response to stdout.
 */
export function writeEmptyResponse(): void {
  writeStdoutJson({});
}

/**
 * Graceful error handler for hook handlers.
 * Logs error to stderr (never stdout in stdio-based processes)
 * and returns an empty response so the agent is never blocked.
 */
export function handleHookError(error: unknown, hookName: string): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[ctxkit:${hookName}] Error: ${message}`);
  writeEmptyResponse();
}

/**
 * Get environment variables set during SessionStart.
 * Returns null values if not set (graceful degradation).
 */
export function getCtxKitEnv(): {
  sessionId: string | null;
  apiUrl: string | null;
  repoRoot: string | null;
} {
  return {
    sessionId: process.env.CTXKIT_SESSION_ID || null,
    apiUrl: process.env.CTXKIT_API || null,
    repoRoot: process.env.CTXKIT_REPO_ROOT || null,
  };
}

/**
 * Detect if the current working directory is inside a git repository.
 * Returns the repo root path or null if not in a git directory.
 */
export function detectGitRoot(cwd: string): string | null {
  try {
    const root = execSync('git rev-parse --show-toplevel', {
      cwd,
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return root || null;
  } catch {
    return null;
  }
}

/**
 * Check if in a non-git directory. Returns true if NOT a git repo.
 * Used for graceful degradation — hooks should still respond without errors.
 */
export function isNonGitDirectory(cwd: string): boolean {
  return detectGitRoot(cwd) === null;
}

/**
 * Enforce a timeout on the hook handler.
 * If the hook takes longer than the timeout, it exits gracefully
 * with an empty response so the agent is never blocked.
 */
export function enforceTimeout(
  timeoutMs: number = DEFAULT_HOOK_TIMEOUT_MS,
  hookName: string = 'unknown',
): NodeJS.Timeout {
  return setTimeout(() => {
    console.error(`[ctxkit:${hookName}] Timeout after ${timeoutMs}ms`);
    writeEmptyResponse();
    process.exit(0);
  }, timeoutMs);
}

/**
 * Run a hook handler with standard error handling and timeout enforcement.
 * Wraps the handler function to catch errors and enforce timeouts.
 */
export async function runHook<T extends HookInputBase>(
  hookName: string,
  handler: (input: T) => Promise<void>,
  timeoutMs: number = DEFAULT_HOOK_TIMEOUT_MS,
): Promise<void> {
  const timer = enforceTimeout(timeoutMs, hookName);
  try {
    const input = await readStdinJson<T>();
    await handler(input);
  } catch (error) {
    handleHookError(error, hookName);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Create a DaemonClient configured from environment variables.
 * Uses CTXKIT_API if set, otherwise falls back to default localhost.
 *
 * Uses dynamic import so that a missing @ctxl/mcp package at install time
 * does not prevent the hook scripts from loading (the error is caught by
 * runHook's try/catch instead of crashing at module load).
 */
export async function createConfiguredClient() {
  const { DaemonClient } = await import('@ctxl/mcp/client');
  const { apiUrl } = getCtxKitEnv();
  return new DaemonClient(apiUrl ? { baseUrl: apiUrl } : undefined);
}
