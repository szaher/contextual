import { Command } from 'commander';

export const sessionsCommand = new Command('sessions')
  .description('List and inspect agent sessions')
  .option('--daemon <url>', 'Daemon URL', 'http://localhost:3742')
  .option('--status <status>', 'Filter by status (active/completed)')
  .option('--limit <n>', 'Maximum results', '20')
  .action(async (options) => {
    const baseUrl = options.daemon;
    const params = new URLSearchParams();
    if (options.status) params.set('status', options.status);
    params.set('limit', options.limit);

    try {
      const res = await fetch(`${baseUrl}/api/v1/sessions?${params}`);
      if (!res.ok) {
        const err = await res.json();
        console.error(`Error: ${err.error?.message || 'Unknown error'}`);
        process.exitCode = 1;
        return;
      }

      const data = await res.json();
      const sessions = data.sessions;

      if (sessions.length === 0) {
        console.log('No sessions found.');
        return;
      }

      // Table header
      console.log(
        `${'ID'.padEnd(16)} ${'Agent'.padEnd(10)} ${'Status'.padEnd(12)} ${'Requests'.padEnd(10)} ${'Started'.padEnd(24)}`,
      );
      console.log('─'.repeat(72));

      for (const s of sessions) {
        console.log(
          `${(s.id || '').padEnd(16)} ${(s.agent_id || '-').padEnd(10)} ${(s.status || '').padEnd(12)} ${String(s.request_count || 0).padEnd(10)} ${(s.started_at || '').padEnd(24)}`,
        );
      }

      console.log(`\nTotal: ${data.total}`);
    } catch (err) {
      console.error(`Failed to connect to daemon at ${baseUrl}: ${(err as Error).message}`);
      process.exitCode = 1;
    }
  });

// Subcommand: sessions show <id>
sessionsCommand
  .command('show <id>')
  .description('Show session details with request timeline')
  .action(async (id: string, _opts, cmd) => {
    const baseUrl = cmd.parent?.opts().daemon || 'http://localhost:3742';

    try {
      const res = await fetch(`${baseUrl}/api/v1/sessions/${id}`);
      if (!res.ok) {
        const err = await res.json();
        console.error(`Error: ${err.error?.message || 'Unknown error'}`);
        process.exitCode = 1;
        return;
      }

      const session = await res.json();

      console.log(`Session: ${session.id}`);
      console.log(`  Status: ${session.status}`);
      console.log(`  Agent: ${session.agent_id || '-'}`);
      console.log(`  Repo: ${session.repo_path}`);
      console.log(`  Dir: ${session.working_dir}`);
      console.log(`  Branch: ${session.branch || '-'}`);
      console.log(`  Started: ${session.started_at}`);
      console.log(`  Ended: ${session.ended_at || '-'}`);

      if (session.events && session.events.length > 0) {
        console.log(`\n  Timeline (${session.events.length} requests):`);
        console.log('  ' + '─'.repeat(60));
        for (let i = 0; i < session.events.length; i++) {
          const e = session.events[i];
          const text = e.request_text.length > 40
            ? e.request_text.slice(0, 40) + '...'
            : e.request_text;
          console.log(
            `  ${i + 1}. [${e.created_at}] ${text} (${e.token_count}/${e.budget} tok)`,
          );
        }
      } else {
        console.log('\n  No requests recorded.');
      }
    } catch (err) {
      console.error(`Failed to connect to daemon at ${baseUrl}: ${(err as Error).message}`);
      process.exitCode = 1;
    }
  });
