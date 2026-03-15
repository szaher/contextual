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
  const client = await createConfiguredClient();

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

  // 7. Check and auto-install git hooks based on policy
  try {
    const { existsSync: fsExistsSync, readFileSync: fsReadFileSync } = await import('node:fs');
    const { join: pathJoin } = await import('node:path');
    const hookPath = pathJoin(gitRoot, '.git', 'hooks', 'prepare-commit-msg');
    const hookInstalled = fsExistsSync(hookPath) && fsReadFileSync(hookPath, 'utf-8').includes('ctxkit hooks init');

    if (!hookInstalled) {
      // Load hook policy from config (simple YAML field extraction, no js-yaml dependency)
      let hookPolicy: 'auto' | 'prompt' | 'skip' = 'prompt';
      try {
        const configPath = pathJoin(gitRoot, '.ctxl', 'config.yaml');
        if (fsExistsSync(configPath)) {
          const configContent = fsReadFileSync(configPath, 'utf-8');
          const autoInstallMatch = configContent.match(/auto_install:\s*(auto|prompt|skip)/);
          if (autoInstallMatch) {
            hookPolicy = autoInstallMatch[1] as 'auto' | 'prompt' | 'skip';
          }
        }
      } catch {
        // Use default 'prompt' policy
      }

      // Check if user previously declined
      const declinedPath = pathJoin(gitRoot, '.ctxl', '.hooks-declined');
      const declined = fsExistsSync(declinedPath);

      if (declined) {
        console.error('[ctxkit:SessionStart] Hook installation previously declined — skipping');
      } else if (hookPolicy === 'auto') {
        console.error('[ctxkit:SessionStart] Auto-installing prepare-commit-msg hook');
        try {
          execSync('ctxkit hooks init', {
            cwd: gitRoot,
            encoding: 'utf-8',
            timeout: 5000,
            stdio: ['pipe', 'pipe', 'pipe'],
          });
          console.error('[ctxkit:SessionStart] Git hooks installed successfully');
        } catch (err) {
          console.error(`[ctxkit:SessionStart] Hook install failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else if (hookPolicy === 'prompt') {
        console.error('[ctxkit:SessionStart] Hook not installed — suggesting installation');
        // The systemMessage will be picked up by the agent
      } else {
        console.error('[ctxkit:SessionStart] Hook auto-install policy is "skip" — skipping');
      }
    }
  } catch (err) {
    console.error(`[ctxkit:SessionStart] Hook check failed (non-blocking): ${err instanceof Error ? err.message : String(err)}`);
  }

  // 8. Index-based context selection (v2) — renumbered from 7
  let indexContext = '';
  try {
    const { existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const ctxlPath = join(gitRoot, '.ctxl');
    if (existsSync(ctxlPath)) {
      console.error('[ctxkit:SessionStart] .ctxl index found — using index-based selection');
      const indexResult = await client.post<{ selected?: Array<{ path: string }> }>('/api/v1/index/select', {
        repo_root: gitRoot,
        prompt: `Session starting in ${cwd}`,
        cwd,
        budget_tokens: 4000,
      });
      if (indexResult && indexResult.selected) {
        const selectedPaths = indexResult.selected.map((s) => s.path);
        indexContext = `\n[CtxKit v2] Selected ${selectedPaths.length} context files via index.`;
      }
    }
  } catch (err) {
    console.error(`[ctxkit:SessionStart] Index selection failed (non-blocking): ${err instanceof Error ? err.message : String(err)}`);
  }

  // 8. Return bootstrap context
  const bootstrapContext = [
    `[CtxKit] Session ${session.id} active.`,
    `Repository: ${gitRoot}`,
    branch ? `Branch: ${branch}` : null,
    `Status: ${session.status}`,
    indexContext || null,
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
