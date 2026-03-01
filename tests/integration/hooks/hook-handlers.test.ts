/**
 * Integration: Hook Handler stdin/stdout Contract (T038)
 *
 * Verifies that each compiled hook handler script:
 *   - Reads JSON from stdin
 *   - Writes valid JSON to stdout matching the HookOutput schema
 *   - Exits with code 0 even when the daemon is unavailable (graceful degradation)
 *   - Uses stderr for logging (never pollutes stdout with non-JSON)
 *
 * Approach: spawn each handler as a child process, pipe JSON input on stdin,
 * capture stdout/stderr, and validate the output structure.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import type { HookOutput } from '@ctxl/core';

// Path to compiled hook handler scripts
const SCRIPTS_DIR = resolve(
  import.meta.dirname,
  '../../../packages/claude-plugin/dist/scripts',
);

/** All hook handler scripts and their corresponding hook_event_name values. */
const HOOK_SCRIPTS = [
  { file: 'session-start.js', eventName: 'SessionStart' },
  { file: 'session-end.js', eventName: 'SessionEnd' },
  { file: 'user-prompt-submit.js', eventName: 'UserPromptSubmit' },
  { file: 'pre-tool-use.js', eventName: 'PreToolUse' },
  { file: 'post-tool-use.js', eventName: 'PostToolUse' },
  { file: 'post-tool-use-failure.js', eventName: 'PostToolUseFailure' },
  { file: 'task-completed.js', eventName: 'TaskCompleted' },
  { file: 'pre-compact.js', eventName: 'PreCompact' },
] as const;

/** Minimal HookInputBase payload used by all handlers. */
function makeBaseInput(
  eventName: string,
  cwd: string,
  extra: Record<string, unknown> = {},
) {
  return {
    session_id: 'test-session-id',
    transcript_path: '/tmp/transcript.json',
    cwd,
    permission_mode: 'default',
    hook_event_name: eventName,
    ...extra,
  };
}

/**
 * Spawn a hook handler script, pipe JSON input on stdin,
 * and collect stdout, stderr, and exit code.
 */
function runHookScript(
  scriptName: string,
  input: Record<string, unknown>,
  env?: Record<string, string>,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn('node', [join(SCRIPTS_DIR, scriptName)], {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => (stdout += d));
    child.stderr.on('data', (d: Buffer) => (stderr += d));
    child.on('close', (code) =>
      resolve({ stdout, stderr, exitCode: code ?? 0 }),
    );
    child.stdin.write(JSON.stringify(input));
    child.stdin.end();
  });
}

/**
 * Parse stdout as JSON and validate it conforms to the HookOutput shape.
 * Returns the parsed output or throws if stdout is not valid JSON.
 */
function parseHookOutput(stdout: string): HookOutput {
  const trimmed = stdout.trim();
  if (trimmed === '') {
    // Some handlers may produce no output on graceful degradation;
    // treat as empty object.
    return {};
  }
  return JSON.parse(trimmed) as HookOutput;
}

/**
 * Assert that a parsed HookOutput conforms to the schema.
 * All fields are optional, so an empty `{}` is valid.
 */
function assertValidHookOutput(output: HookOutput): void {
  // Top-level optional booleans / strings
  if (output.continue !== undefined) {
    expect(typeof output.continue).toBe('boolean');
  }
  if (output.stopReason !== undefined) {
    expect(typeof output.stopReason).toBe('string');
  }
  if (output.suppressOutput !== undefined) {
    expect(typeof output.suppressOutput).toBe('boolean');
  }
  if (output.systemMessage !== undefined) {
    expect(typeof output.systemMessage).toBe('string');
  }

  // hookSpecificOutput sub-object
  if (output.hookSpecificOutput !== undefined) {
    expect(typeof output.hookSpecificOutput.hookEventName).toBe('string');

    if (output.hookSpecificOutput.additionalContext !== undefined) {
      expect(typeof output.hookSpecificOutput.additionalContext).toBe('string');
    }
    if (output.hookSpecificOutput.permissionDecision !== undefined) {
      expect(['allow', 'deny', 'ask']).toContain(
        output.hookSpecificOutput.permissionDecision,
      );
    }
    if (output.hookSpecificOutput.permissionDecisionReason !== undefined) {
      expect(typeof output.hookSpecificOutput.permissionDecisionReason).toBe(
        'string',
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
describe('Integration: Hook Handler stdin/stdout Contract (T038)', () => {
  let tmpDir: string;
  let gitTmpDir: string;
  let nonGitDir: string;

  beforeAll(() => {
    // Create a temp directory tree for test scenarios
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxl-hooks-test-'));
    // A directory that IS a git repo
    gitTmpDir = join(tmpDir, 'git-repo');
    mkdirSync(gitTmpDir, { recursive: true });
    execSync('git init', { cwd: gitTmpDir, stdio: 'ignore' });
    execSync('git config user.email "test@test.com"', {
      cwd: gitTmpDir,
      stdio: 'ignore',
    });
    execSync('git config user.name "Test"', {
      cwd: gitTmpDir,
      stdio: 'ignore',
    });
    execSync('git commit --allow-empty -m "init"', {
      cwd: gitTmpDir,
      stdio: 'ignore',
    });

    // A directory that is NOT a git repo
    nonGitDir = join(tmpDir, 'no-git');
    mkdirSync(nonGitDir, { recursive: true });
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // Category 1: Every hook returns valid JSON (no crash) without env vars
  // -----------------------------------------------------------------------
  describe('returns valid JSON without CTXKIT env vars', () => {
    for (const { file, eventName } of HOOK_SCRIPTS) {
      it(`${eventName} (${file}) returns valid JSON and exits 0`, async () => {
        const input = makeBaseInput(eventName, tmpDir, buildExtraFields(eventName));
        const result = await runHookScript(file, input, {
          // Strip all CTXKIT_* env vars so handlers take the "no session" path
          CTXKIT_SESSION_ID: '',
          CTXKIT_API: '',
          CTXKIT_REPO_ROOT: '',
        });

        expect(result.exitCode).toBe(0);

        const output = parseHookOutput(result.stdout);
        assertValidHookOutput(output);
      });
    }
  });

  // -----------------------------------------------------------------------
  // Category 2: Graceful degradation without CTXKIT_SESSION_ID
  // -----------------------------------------------------------------------
  describe('graceful degradation without CTXKIT_SESSION_ID', () => {
    for (const { file, eventName } of HOOK_SCRIPTS) {
      it(`${eventName} returns empty {} when CTXKIT_SESSION_ID is missing`, async () => {
        const input = makeBaseInput(eventName, tmpDir, buildExtraFields(eventName));
        const result = await runHookScript(file, input, {
          CTXKIT_SESSION_ID: '',
          CTXKIT_API: '',
          CTXKIT_REPO_ROOT: '',
        });

        expect(result.exitCode).toBe(0);

        const output = parseHookOutput(result.stdout);
        // Without a session ID, all hooks should return empty response
        expect(output).toEqual({});
      });
    }
  });

  // -----------------------------------------------------------------------
  // Category 3: SessionStart in a non-git directory returns empty {}
  // -----------------------------------------------------------------------
  describe('SessionStart in non-git directory', () => {
    it('returns empty {} when cwd is not a git repository', async () => {
      const input = makeBaseInput('SessionStart', nonGitDir, {
        source: 'new',
      });
      const result = await runHookScript('session-start.js', input, {
        CTXKIT_SESSION_ID: '',
        CTXKIT_API: '',
        CTXKIT_REPO_ROOT: '',
      });

      expect(result.exitCode).toBe(0);

      const output = parseHookOutput(result.stdout);
      expect(output).toEqual({});
      // stderr should mention "not in a git repository"
      expect(result.stderr.toLowerCase()).toContain('not in a git repository');
    });
  });

  // -----------------------------------------------------------------------
  // Category 4: SessionStart in git repo without daemon returns empty {}
  // -----------------------------------------------------------------------
  describe('SessionStart in git repo without daemon', () => {
    it('returns empty {} when daemon is unreachable', async () => {
      const input = makeBaseInput('SessionStart', gitTmpDir, {
        source: 'new',
      });
      const result = await runHookScript('session-start.js', input, {
        CTXKIT_SESSION_ID: '',
        // Point API to a port where nothing is listening
        CTXKIT_API: 'http://127.0.0.1:19999',
        CTXKIT_REPO_ROOT: '',
      });

      expect(result.exitCode).toBe(0);

      const output = parseHookOutput(result.stdout);
      expect(output).toEqual({});
    });
  });

  // -----------------------------------------------------------------------
  // Category 5: Hooks with CTXKIT_SESSION_ID but no daemon return empty {}
  //             (except PreCompact, which builds a compaction spine from
  //              env vars and local .ctx file detection without the daemon)
  // -----------------------------------------------------------------------
  describe('hooks with session ID but no daemon (graceful degradation)', () => {
    const envWithSession: Record<string, string> = {
      CTXKIT_SESSION_ID: 'sess_test_no_daemon',
      CTXKIT_API: 'http://127.0.0.1:19999', // nothing listening
      CTXKIT_REPO_ROOT: '/tmp/fake-repo',
    };

    // SessionStart is excluded: it creates its own session, doesn't read
    // CTXKIT_SESSION_ID from env. All other hooks rely on it.
    // PreCompact is tested separately: it builds a compaction spine from
    // env vars even when the daemon is down.
    const hooksExcludingSpecial = HOOK_SCRIPTS.filter(
      (h) => h.file !== 'session-start.js' && h.file !== 'pre-compact.js',
    );

    for (const { file, eventName } of hooksExcludingSpecial) {
      it(`${eventName} returns empty {} when daemon is unreachable`, async () => {
        const input = makeBaseInput(eventName, tmpDir, buildExtraFields(eventName));
        const result = await runHookScript(file, input, envWithSession);

        expect(result.exitCode).toBe(0);

        const output = parseHookOutput(result.stdout);
        // When daemon is unreachable, handlers should degrade to empty response
        expect(output).toEqual({});
      });
    }

    it('PreCompact returns a valid compaction spine when daemon is unreachable', async () => {
      const input = makeBaseInput('PreCompact', tmpDir, buildExtraFields('PreCompact'));
      const result = await runHookScript('pre-compact.js', input, envWithSession);

      expect(result.exitCode).toBe(0);

      const output = parseHookOutput(result.stdout);
      assertValidHookOutput(output);

      // PreCompact builds a spine from env vars even without the daemon.
      // The proposals fetch fails gracefully, but the spine is still returned.
      expect(output.hookSpecificOutput).toBeDefined();
      expect(output.hookSpecificOutput!.hookEventName).toBe('PreCompact');
      expect(output.hookSpecificOutput!.additionalContext).toBeDefined();
      expect(output.hookSpecificOutput!.additionalContext).toContain(
        'sess_test_no_daemon',
      );
      expect(output.hookSpecificOutput!.additionalContext).toContain(
        'Compaction Spine',
      );
    });
  });

  // -----------------------------------------------------------------------
  // Category 6: stdout never contains non-JSON (logging is on stderr only)
  // -----------------------------------------------------------------------
  describe('logging goes to stderr, never stdout', () => {
    for (const { file, eventName } of HOOK_SCRIPTS) {
      it(`${eventName} writes only valid JSON to stdout`, async () => {
        const input = makeBaseInput(eventName, tmpDir, buildExtraFields(eventName));
        const result = await runHookScript(file, input, {
          CTXKIT_SESSION_ID: '',
          CTXKIT_API: '',
          CTXKIT_REPO_ROOT: '',
        });

        // stdout must be either empty or a single JSON object
        const trimmed = result.stdout.trim();
        if (trimmed.length > 0) {
          expect(() => JSON.parse(trimmed)).not.toThrow();
        }

        // stderr should contain log messages (handlers always log something)
        expect(result.stderr.length).toBeGreaterThan(0);
      });
    }
  });

  // -----------------------------------------------------------------------
  // Category 7: Exit code is always 0 across all scenarios
  // -----------------------------------------------------------------------
  describe('exit code is always 0', () => {
    it('all hooks exit 0 with empty env', async () => {
      const results = await Promise.all(
        HOOK_SCRIPTS.map(({ file, eventName }) =>
          runHookScript(
            file,
            makeBaseInput(eventName, tmpDir, buildExtraFields(eventName)),
            {
              CTXKIT_SESSION_ID: '',
              CTXKIT_API: '',
              CTXKIT_REPO_ROOT: '',
            },
          ).then((r) => ({ file, ...r })),
        ),
      );

      for (const r of results) {
        expect(r.exitCode, `${r.file} should exit 0`).toBe(0);
      }
    });

    it('all hooks exit 0 with unreachable daemon', async () => {
      const results = await Promise.all(
        HOOK_SCRIPTS.filter((h) => h.file !== 'session-start.js').map(
          ({ file, eventName }) =>
            runHookScript(
              file,
              makeBaseInput(eventName, tmpDir, buildExtraFields(eventName)),
              {
                CTXKIT_SESSION_ID: 'sess_exit_code_test',
                CTXKIT_API: 'http://127.0.0.1:19999',
                CTXKIT_REPO_ROOT: '/tmp/fake-repo',
              },
            ).then((r) => ({ file, ...r })),
        ),
      );

      for (const r of results) {
        expect(r.exitCode, `${r.file} should exit 0`).toBe(0);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build hook-specific extra fields for a given event name.
 * Each hook handler expects certain fields beyond HookInputBase.
 */
function buildExtraFields(eventName: string): Record<string, unknown> {
  switch (eventName) {
    case 'SessionStart':
      return { source: 'new' };
    case 'SessionEnd':
      return { reason: 'user_exit' };
    case 'UserPromptSubmit':
      return { prompt: 'Explain the codebase structure' };
    case 'PreToolUse':
      return {
        tool_name: 'Bash',
        tool_input: { command: 'ls -la' },
      };
    case 'PostToolUse':
      return {
        tool_name: 'Bash',
        tool_input: { command: 'ls -la' },
        tool_response: { output: 'file1.ts\nfile2.ts', exit_code: 0 },
        tool_use_id: 'toolu_test_123',
      };
    case 'PostToolUseFailure':
      return {
        tool_name: 'Bash',
        tool_input: { command: 'exit 1' },
        tool_use_id: 'toolu_fail_123',
        error: 'Command failed with exit code 1',
        is_interrupt: false,
      };
    case 'TaskCompleted':
      return {
        task_id: 'task_test_123',
        task_subject: 'Test task',
        task_description: 'A test task for hook validation',
      };
    case 'PreCompact':
      return {
        trigger: 'manual',
        custom_instructions: '',
      };
    default:
      return {};
  }
}
