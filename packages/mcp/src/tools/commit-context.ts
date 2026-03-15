import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { DaemonApiError, DAEMON_UNAVAILABLE_MESSAGE } from '../client.js';
import type { DaemonClient } from '../client.js';

export function registerCommitContextTool(server: McpServer, client: DaemonClient): void {
  server.tool(
    'ctxkit.commit_context',
    'Query commits with ctxkit context trailers from git history',
    {
      cwd: z.string().describe('Repository root path'),
      session_id: z.string().optional().describe('Filter by session ID'),
      since: z.string().optional().describe('Commits after this ISO 8601 date'),
      until: z.string().optional().describe('Commits before this ISO 8601 date'),
      limit: z.number().positive().optional().default(50).describe('Max commits to return'),
    },
    async (args) => {
      try {
        const qs = new URLSearchParams({ cwd: args.cwd });
        if (args.session_id) qs.set('session_id', args.session_id);
        if (args.since) qs.set('since', args.since);
        if (args.until) qs.set('until', args.until);
        if (args.limit) qs.set('limit', String(args.limit));

        const result = await client.get(`/api/v1/commit-context?${qs}`);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (error) {
        const message =
          error instanceof DaemonApiError
            ? error.message
            : DAEMON_UNAVAILABLE_MESSAGE;
        return { content: [{ type: 'text' as const, text: message }], isError: true };
      }
    },
  );
}
