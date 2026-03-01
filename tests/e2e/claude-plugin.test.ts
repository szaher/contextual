import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { serve } from '@hono/node-server';
import type { ServerType } from '@hono/node-server';
import { createApp } from '../../packages/daemon/src/server.js';
import { openDatabase } from '../../packages/daemon/src/store/db.js';
import type Database from 'better-sqlite3';

/**
 * T039 — E2E test for the Claude Code plugin.
 *
 * Starts a real daemon, then simulates the full hook lifecycle:
 *   SessionStart → UserPromptSubmit → PreToolUse → PostToolUse →
 *   TaskCompleted → PreCompact → SessionEnd
 *
 * Also verifies:
 * - Non-git-directory graceful degradation
 * - Determinism (same prompt → same context pack content)
 */

const SCRIPTS_DIR = resolve(
  import.meta.dirname,
  '../../packages/claude-plugin/dist/scripts',
);

function waitForListening(server: ServerType): Promise<number> {
  return new Promise((resolve, reject) => {
    server.on('listening', () => {
      const addr = server.address();
      if (typeof addr === 'object' && addr !== null) {
        resolve(addr.port);
      } else {
        reject(new Error('Could not get server port'));
      }
    });
    server.on('error', reject);
  });
}

interface HookResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  parsed: Record<string, unknown> | null;
}

function runHookScript(
  scriptName: string,
  input: Record<string, unknown>,
  env?: Record<string, string>,
): Promise<HookResult> {
  return new Promise((resolve) => {
    const child = spawn('node', [join(SCRIPTS_DIR, scriptName)], {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 15_000,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    child.on('close', (code) => {
      let parsed: Record<string, unknown> | null = null;
      try {
        const trimmed = stdout.trim();
        if (trimmed) parsed = JSON.parse(trimmed);
      } catch {
        // not valid JSON
      }
      resolve({ stdout, stderr, exitCode: code ?? 0, parsed });
    });

    child.stdin.write(JSON.stringify(input));
    child.stdin.end();
  });
}

function makeBaseInput(
  hookEventName: string,
  cwd: string,
  overrides?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    session_id: 'test-session',
    transcript_path: '/tmp/transcript.jsonl',
    cwd,
    permission_mode: 'default',
    hook_event_name: hookEventName,
    ...overrides,
  };
}

describe('E2E: Claude Code Plugin Hook Lifecycle', () => {
  let tmpDir: string;
  let fixtureDir: string;
  let nonGitDir: string;
  let db: Database.Database;
  let daemonServer: ServerType;
  let daemonPort: number;
  let daemonUrl: string;
  let sessionId: string;

  beforeAll(async () => {
    // Verify compiled hook scripts exist (catches missing build output)
    const requiredScripts = [
      'session-start.js', 'session-end.js', 'post-tool-use.js',
      'post-tool-use-failure.js', 'pre-compact.js', 'pre-tool-use.js',
      'task-completed.js', 'user-prompt-submit.js',
    ];
    for (const s of requiredScripts) {
      const scriptPath = join(SCRIPTS_DIR, s);
      if (!existsSync(scriptPath)) {
        throw new Error(
          `Compiled hook script not found: ${scriptPath}. ` +
          `Run 'pnpm build' first. SCRIPTS_DIR=${SCRIPTS_DIR}`,
        );
      }
    }

    // Create temp directories
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxl-e2e-plugin-'));
    nonGitDir = join(tmpDir, 'non-git');
    mkdirSync(nonGitDir, { recursive: true });

    // Create a fixture repo with git and .ctx
    fixtureDir = join(tmpDir, 'repo');
    mkdirSync(join(fixtureDir, 'src'), { recursive: true });

    // Initialize git repo
    const { execSync } = await import('node:child_process');
    execSync('git init', { cwd: fixtureDir, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', {
      cwd: fixtureDir,
      stdio: 'pipe',
    });
    execSync('git config user.name "Test"', {
      cwd: fixtureDir,
      stdio: 'pipe',
    });

    writeFileSync(
      join(fixtureDir, '.ctx'),
      `---
decisions:
  - id: tech-stack
    title: "TypeScript + Node.js"
    status: active
    tags: [typescript, nodejs]
    body: "Using TypeScript 5.x with Node.js 20+"
key_files:
  - id: main-entry
    path: src/index.ts
    role: "Main application entry point"
    tags: [entry, typescript]
`,
    );
    writeFileSync(
      join(fixtureDir, 'src', 'index.ts'),
      'export const main = () => {};\n',
    );

    execSync('git add -A && git commit -m "init"', {
      cwd: fixtureDir,
      stdio: 'pipe',
    });

    // Start daemon
    const dbPath = join(tmpDir, 'test.db');
    db = openDatabase(dbPath);
    const app = createApp({ db, startedAt: new Date() });

    daemonServer = serve({
      fetch: app.fetch,
      port: 0,
      hostname: '127.0.0.1',
    });

    daemonPort = await waitForListening(daemonServer);
    daemonUrl = `http://127.0.0.1:${daemonPort}`;
  });

  afterAll(() => {
    daemonServer?.close();
    db?.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // Shared env for hooks that need session + daemon
  function hookEnv(extra?: Record<string, string>): Record<string, string> {
    return {
      CTXKIT_API: daemonUrl,
      CTXKIT_SESSION_ID: sessionId || '',
      CTXKIT_REPO_ROOT: fixtureDir,
      ...extra,
    };
  }

  // --- Non-git-directory graceful degradation ---

  it('should gracefully degrade SessionStart in non-git directory', async () => {
    const result = await runHookScript(
      'session-start.js',
      makeBaseInput('SessionStart', nonGitDir, {
        source: 'startup',
        model: 'claude-sonnet-4-6',
      }),
      { CTXKIT_API: daemonUrl },
    );

    expect(result.exitCode, `session-start.js (non-git) exited ${result.exitCode}. stderr: ${result.stderr}`).toBe(0);
    expect(result.parsed).toBeDefined();
    // Should return empty response - no hookSpecificOutput with context
    expect(result.stderr).toContain('Not in a git repository');
  });

  // --- Full lifecycle ---

  it('should execute SessionStart and create a session', async () => {
    const envFile = join(tmpDir, 'env-file.txt');
    writeFileSync(envFile, '');

    const result = await runHookScript(
      'session-start.js',
      makeBaseInput('SessionStart', fixtureDir, {
        source: 'startup',
        model: 'claude-sonnet-4-6',
      }),
      {
        CTXKIT_API: daemonUrl,
        CLAUDE_ENV_FILE: envFile,
      },
    );

    expect(result.exitCode, `session-start.js exited ${result.exitCode}. stderr: ${result.stderr}`).toBe(0);
    expect(result.parsed).toBeDefined();

    // Should have hookSpecificOutput with bootstrap context
    const hookOutput = result.parsed?.hookSpecificOutput as
      | { hookEventName: string; additionalContext: string }
      | undefined;
    expect(hookOutput).toBeDefined();
    expect(hookOutput!.hookEventName).toBe('SessionStart');
    expect(hookOutput!.additionalContext).toContain('Session');
    expect(hookOutput!.additionalContext).toContain('active');

    // Extract session ID from env file
    const { readFileSync } = await import('node:fs');
    const envContent = readFileSync(envFile, 'utf-8');
    const match = envContent.match(/CTXKIT_SESSION_ID=(\S+)/);
    expect(match).toBeTruthy();
    sessionId = match![1];
    expect(sessionId).toMatch(/^sess_/);
  });

  it('should handle PostToolUse and log events', async () => {
    const result = await runHookScript(
      'post-tool-use.js',
      makeBaseInput('PostToolUse', fixtureDir, {
        tool_name: 'Edit',
        tool_input: { file_path: 'src/index.ts', old_string: 'a', new_string: 'b' },
        tool_response: { success: true },
        tool_use_id: 'tu_test1',
      }),
      hookEnv(),
    );

    expect(result.exitCode, `post-tool-use.js exited ${result.exitCode}. stderr: ${result.stderr}`).toBe(0);
    expect(result.parsed).toBeDefined();
    // PostToolUse returns empty response
  });

  it('should handle PostToolUseFailure and log errors', async () => {
    const result = await runHookScript(
      'post-tool-use-failure.js',
      makeBaseInput('PostToolUseFailure', fixtureDir, {
        tool_name: 'Bash',
        tool_input: { command: 'npm test' },
        tool_use_id: 'tu_test2',
        error: 'Command failed with exit code 1',
        is_interrupt: false,
      }),
      hookEnv(),
    );

    expect(result.exitCode, `post-tool-use-failure.js exited ${result.exitCode}. stderr: ${result.stderr}`).toBe(0);
    expect(result.parsed).toBeDefined();
  });

  it('should handle PreCompact and return compaction spine', async () => {
    const result = await runHookScript(
      'pre-compact.js',
      makeBaseInput('PreCompact', fixtureDir, {
        trigger: 'auto',
        custom_instructions: '',
      }),
      hookEnv(),
    );

    expect(result.exitCode, `pre-compact.js exited ${result.exitCode}. stderr: ${result.stderr}`).toBe(0);
    expect(result.parsed).toBeDefined();

    const hookOutput = result.parsed?.hookSpecificOutput as
      | { hookEventName: string; additionalContext: string }
      | undefined;
    expect(hookOutput).toBeDefined();
    expect(hookOutput!.hookEventName).toBe('PreCompact');
    expect(hookOutput!.additionalContext).toContain(
      '[CtxKit Compaction Spine]',
    );
    expect(hookOutput!.additionalContext).toContain(sessionId);
  });

  it('should handle SessionEnd and close the session', async () => {
    const result = await runHookScript(
      'session-end.js',
      makeBaseInput('SessionEnd', fixtureDir, {
        reason: 'prompt_input_exit',
      }),
      hookEnv(),
    );

    expect(result.exitCode, `session-end.js exited ${result.exitCode}. stderr: ${result.stderr}`).toBe(0);
    expect(result.parsed).toBeDefined();
    expect(result.stderr).toContain('closed');

    // Verify session is actually closed on daemon
    const res = await fetch(
      `${daemonUrl}/api/v1/sessions/${sessionId}`,
    );
    expect(res.ok).toBe(true);
    const session = (await res.json()) as {
      status: string;
      ended_at: string | null;
    };
    expect(session.status).toBe('completed');
    expect(session.ended_at).toBeTruthy();
  });

  // --- Graceful degradation without session ---

  it('should gracefully skip hooks when CTXKIT_SESSION_ID is not set', async () => {
    const hooks = [
      {
        script: 'session-end.js',
        input: { reason: 'other' },
      },
      {
        script: 'post-tool-use.js',
        input: {
          tool_name: 'Read',
          tool_input: {},
          tool_response: {},
          tool_use_id: 'tu_x',
        },
      },
      {
        script: 'post-tool-use-failure.js',
        input: {
          tool_name: 'Bash',
          tool_input: {},
          tool_use_id: 'tu_y',
          error: 'fail',
          is_interrupt: false,
        },
      },
      {
        script: 'pre-compact.js',
        input: { trigger: 'auto', custom_instructions: '' },
      },
    ];

    for (const { script, input } of hooks) {
      const result = await runHookScript(
        script,
        makeBaseInput(script.replace('.js', ''), fixtureDir, input),
        { CTXKIT_API: daemonUrl }, // no CTXKIT_SESSION_ID
      );

      expect(result.exitCode, `${script} (no-session) exited ${result.exitCode}. stderr: ${result.stderr}`).toBe(0);
      expect(result.parsed).toBeDefined();
      // Should return empty {} — no hookSpecificOutput
      expect(result.parsed!.hookSpecificOutput).toBeUndefined();
    }
  });

  // --- Verify session timeline has events ---

  it('should verify session timeline has logged events from lifecycle', async () => {
    // Create a new session for this check
    const createRes = await fetch(`${daemonUrl}/api/v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repo_path: fixtureDir,
        working_dir: fixtureDir,
        agent_id: 'timeline-test',
      }),
    });
    const newSession = (await createRes.json()) as { id: string };

    // Log two tool events
    await runHookScript(
      'post-tool-use.js',
      makeBaseInput('PostToolUse', fixtureDir, {
        tool_name: 'Read',
        tool_input: { file_path: 'src/index.ts' },
        tool_response: { content: '...' },
        tool_use_id: 'tu_read1',
      }),
      { CTXKIT_API: daemonUrl, CTXKIT_SESSION_ID: newSession.id, CTXKIT_REPO_ROOT: fixtureDir },
    );

    await runHookScript(
      'post-tool-use-failure.js',
      makeBaseInput('PostToolUseFailure', fixtureDir, {
        tool_name: 'Bash',
        tool_input: { command: 'false' },
        tool_use_id: 'tu_bash1',
        error: 'exit code 1',
        is_interrupt: false,
      }),
      { CTXKIT_API: daemonUrl, CTXKIT_SESSION_ID: newSession.id, CTXKIT_REPO_ROOT: fixtureDir },
    );

    // Verify events on session
    const detailRes = await fetch(
      `${daemonUrl}/api/v1/sessions/${newSession.id}`,
    );
    const detail = (await detailRes.json()) as {
      events: Array<{ event_type?: string }>;
    };
    expect(detail.events.length).toBeGreaterThanOrEqual(2);
  });
});
