/**
 * SessionStart hook handler (T026)
 *
 * Triggered when a Claude Code session starts, resumes, or is cleared/compacted.
 * Responsibilities:
 *   1. Detect git root — gracefully degrade if not in a git repo.
 *   2. Ensure the CtxKit daemon is running (auto-start if needed).
 *   3. Create a CtxKit session tied to the current repository and branch.
 *   4. Export session env vars via CLAUDE_ENV_FILE so downstream hooks
 *      (UserPromptSubmit, PreToolUse, SessionEnd) can find the session.
 *   5. Return bootstrap context as additionalContext for the agent.
 *
 * This is a stdio-based process: all logging goes to stderr, structured
 * output goes to stdout via writeStdoutJson().
 */

import { execSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import {
  runHook,
  detectGitRoot,
  createConfiguredClient,
  writeStdoutJson,
  writeEmptyResponse,
  type HookInputBase,
} from '../src/utils.js';

/** Input schema for the SessionStart hook. */
interface SessionStartInput extends HookInputBase {
  source: 'startup' | 'resume' | 'clear' | 'compact';
  model: string;
}

runHook<SessionStartInput>('SessionStart', async (input) => {
  const { cwd, source } = input;

  // 1. Detect git root — if not in a git repo, degrade gracefully
  const gitRoot = detectGitRoot(cwd);
  if (!gitRoot) {
    console.error('[ctxkit:SessionStart] Not in a git repository — skipping');
    writeEmptyResponse();
    return;
  }

  // 2. Create daemon client
  const client = createConfiguredClient();

  // 3. Check daemon health
  const healthy = await client.healthCheck();
  if (!healthy) {
    console.error('[ctxkit:SessionStart] Daemon not running — attempting auto-start');
    try {
      execSync('ctxkit daemon start --background', {
        cwd: gitRoot,
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      console.error('[ctxkit:SessionStart] Daemon started successfully');
    } catch (err) {
      console.error(
        `[ctxkit:SessionStart] Failed to start daemon: ${err instanceof Error ? err.message : String(err)}`,
      );
      writeEmptyResponse();
      return;
    }
  }

  // 4. Detect current branch
  let branch: string | undefined;
  try {
    branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd,
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    console.error('[ctxkit:SessionStart] Could not detect git branch');
  }

  // 5. Create session
  const session = await client.createSession({
    repo_path: gitRoot,
    working_dir: cwd,
    branch,
    agent_id: 'claude-code',
  });

  console.error(
    `[ctxkit:SessionStart] Session created: ${session.id} (source=${source})`,
  );

  // 6. Write env vars to CLAUDE_ENV_FILE so downstream hooks can find this session
  const envFile = process.env.CLAUDE_ENV_FILE;
  if (envFile) {
    const daemonUrl = process.env.CTXKIT_API || 'http://localhost:3742';
    const envContent = [
      `CTXKIT_SESSION_ID=${session.id}`,
      `CTXKIT_API=${daemonUrl}`,
      `CTXKIT_REPO_ROOT=${gitRoot}`,
    ].join('\n') + '\n';

    try {
      appendFileSync(envFile, envContent, 'utf-8');
      console.error(`[ctxkit:SessionStart] Env vars written to ${envFile}`);
    } catch (err) {
      console.error(
        `[ctxkit:SessionStart] Failed to write env file: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // 7. Return bootstrap context
  const bootstrapContext = [
    `[CtxKit] Session ${session.id} active.`,
    `Repository: ${gitRoot}`,
    branch ? `Branch: ${branch}` : null,
    `Status: ${session.status}`,
  ]
    .filter(Boolean)
    .join('\n');

  writeStdoutJson({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: bootstrapContext,
    },
  });
}, 10_000);
