import { Command } from 'commander';
import { buildContextPack } from '@ctxl/core';
import { execSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';

export const runCommand = new Command('run')
  .description('Wrap an agent command with context injection')
  .option('--daemon <url>', 'Daemon URL', 'http://localhost:3742')
  .option('--cwd <path>', 'Working directory', process.cwd())
  .option('--budget <tokens>', 'Token budget', '4000')
  .option('--agent <id>', 'Agent identifier', 'default')
  .option('--request <text>', 'Initial request text', '')
  .argument('<cmd...>', 'Command to wrap')
  .allowExcessArguments(true)
  .action(async (cmdArgs: string[], options) => {
    const workingDir = resolve(options.cwd);
    const repoRoot = findRepoRoot(workingDir);
    const budgetTokens = parseInt(options.budget, 10);
    const daemonUrl = options.daemon;

    // Step 1: Create session on daemon
    let sessionId: string | null = null;
    try {
      const res = await fetch(`${daemonUrl}/api/v1/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo_path: repoRoot,
          working_dir: workingDir,
          branch: getBranch(repoRoot),
          agent_id: options.agent,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        sessionId = data.id;
        console.error(`[ctxkit] Session started: ${sessionId}`);
      }
    } catch {
      console.error('[ctxkit] Warning: Could not connect to daemon, running without session tracking');
    }

    // Step 2: Build context pack
    const result = buildContextPack({
      workingDir,
      repoRoot,
      requestText: options.request || cmdArgs.join(' '),
      budgetTokens,
    });

    const contextJson = JSON.stringify(result.pack);

    // Step 3: Record event on daemon if session exists
    if (sessionId) {
      try {
        await fetch(`${daemonUrl}/api/v1/context-pack`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            repo_path: repoRoot,
            working_dir: workingDir,
            request_text: options.request || cmdArgs.join(' '),
            budget_tokens: budgetTokens,
          }),
        });
      } catch {
        // Non-fatal: context pack already built locally
      }
    }

    // Step 4: Spawn wrapped command with context injected via env
    const [cmd, ...args] = cmdArgs;
    const child = spawn(cmd, args, {
      cwd: workingDir,
      stdio: ['pipe', 'inherit', 'inherit'],
      env: {
        ...process.env,
        CTXL_CONTEXT_PACK: contextJson,
        CTXL_SESSION_ID: sessionId || '',
        CTXL_DAEMON_URL: daemonUrl,
        CTXL_TOKENS_USED: String(result.pack.total_tokens),
        CTXL_TOKENS_BUDGET: String(result.pack.budget_tokens),
      },
    });

    // Step 5: End session when child exits
    child.on('close', async (code) => {
      if (sessionId) {
        try {
          await fetch(`${daemonUrl}/api/v1/sessions/${sessionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'completed' }),
          });
          console.error(`[ctxkit] Session ended: ${sessionId}`);
        } catch {
          // Non-fatal
        }
      }
      process.exit(code ?? 0);
    });

    child.on('error', (err) => {
      console.error(`[ctxkit] Failed to start command: ${err.message}`);
      process.exit(1);
    });
  });

function findRepoRoot(startDir: string): string {
  let current = startDir;
  while (true) {
    if (existsSync(join(current, '.git'))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return startDir;
    }
    current = parent;
  }
}

function getBranch(repoRoot: string): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: repoRoot,
      encoding: 'utf-8',
    }).trim();
  } catch {
    return 'unknown';
  }
}
