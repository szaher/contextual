import { Command } from 'commander';
import { execSync } from 'node:child_process';

export const prContextCommand = new Command('pr')
  .description('Generate PR context documents')
  .option('--session <id>', 'Specific session ID')
  .option('--branch', 'Use current branch (all sessions since merge-base)')
  .option('--since <ref>', 'Git ref to diff from (default: merge-base with main)')
  .option('--format <md|json>', 'Output format', 'md')
  .option('--link-specs', 'Cross-reference spec-kit artifacts')
  .option('--gh', 'Pipe-friendly output for gh pr create --body-file -')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    try {
      let repoRoot: string;
      try {
        repoRoot = execSync('git rev-parse --show-toplevel', {
          encoding: 'utf-8',
          timeout: 3000,
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
      } catch {
        console.error('Error: Not a git repository');
        process.exit(1);
        return;
      }

      const daemonUrl = process.env.CTXKIT_DAEMON_URL || 'http://127.0.0.1:3742';

      // Get sessions from daemon
      let sessions: Array<{
        id: string;
        repo_path: string;
        branch: string | null;
        agent_id: string | null;
        started_at: string;
        ended_at: string | null;
        events: Array<{
          id: string;
          request_text: string;
          token_count: number;
          created_at: string;
          context_pack: string | null;
        }>;
        tool_events: Array<{
          tool_name: string;
          tool_input: string;
          tool_response: string | null;
          event_type: string;
          duration_ms: number | null;
          created_at: string;
        }>;
      }> = [];

      try {
        if (options.session) {
          const res = await fetch(`${daemonUrl}/api/v1/sessions/${options.session}`);
          if (res.ok) {
            const data = await res.json();
            sessions = [{
              ...data,
              tool_events: data.tool_events || [],
            }];
          }
        } else {
          const res = await fetch(`${daemonUrl}/api/v1/sessions?repo_path=${encodeURIComponent(repoRoot)}&limit=20`);
          if (res.ok) {
            const data = await res.json();
            // For each session, fetch detailed events
            for (const s of data.sessions) {
              const detailRes = await fetch(`${daemonUrl}/api/v1/sessions/${s.id}`);
              if (detailRes.ok) {
                const detail = await detailRes.json();
                sessions.push({
                  ...detail,
                  tool_events: detail.tool_events || [],
                });
              }
            }
          }
        }
      } catch {
        console.error('Error: Daemon not running. Start with \'ctxkit daemon start\'');
        process.exit(1);
        return;
      }

      if (sessions.length === 0) {
        if (options.json) {
          console.log(JSON.stringify({ message: 'No session data found for the specified range' }));
        } else {
          console.log('No session data found for the specified range.');
        }
        return;
      }

      // Determine git range
      let gitRange: string | undefined;
      if (options.since) {
        gitRange = `${options.since}..HEAD`;
      } else if (options.branch) {
        try {
          const branch = execSync('git rev-parse --abbrev-ref HEAD', {
            cwd: repoRoot,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
          }).trim();
          const mergeBase = execSync(`git merge-base main ${branch}`, {
            cwd: repoRoot,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
          }).trim();
          gitRange = `${mergeBase}..HEAD`;
        } catch { /* use default */ }
      }

      const { collectPrContext, renderPrMarkdown, renderPrJson, renderGhBody } = await import('@ctxkit/core');

      const prContext = collectPrContext(sessions, {
        repoRoot,
        gitRange,
        linkSpecs: options.linkSpecs,
      });

      if (options.json) {
        console.log(JSON.stringify({
          format: options.format || 'markdown',
          content: options.format === 'json' ? prContext : renderPrMarkdown(prContext),
          stats: prContext.stats,
        }, null, 2));
      } else if (options.gh) {
        console.log(renderGhBody(prContext));
      } else if (options.format === 'json') {
        console.log(renderPrJson(prContext));
      } else {
        console.log(renderPrMarkdown(prContext));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (options.json) {
        console.log(JSON.stringify({ error: message }));
      } else {
        console.error(`Error: ${message}`);
      }
      process.exit(1);
    }
  });
