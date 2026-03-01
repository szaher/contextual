import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { DaemonApiError, DAEMON_UNAVAILABLE_MESSAGE } from '../client.js';
import type { DaemonClient } from '../client.js';

export function registerMemoryTool(server: McpServer, client: DaemonClient): void {
  server.tool(
    'ctxkit.memory.search',
    'Search .ctx entries by query text',
    {
      query: z.string(),
      cwd: z.string(),
      repo_root: z.string().optional(),
      limit: z.number().positive().optional().default(10),
    },
    async (args) => {
      try {
        const result = await client.searchMemory({
          query: args.query,
          cwd: args.cwd,
          repo_root: args.repo_root,
          limit: args.limit,
        });
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (error) {
        const message =
          error instanceof DaemonApiError
            ? error.message
            : DAEMON_UNAVAILABLE_MESSAGE;
        return { content: [{ type: 'text', text: message }], isError: true };
      }
    },
  );
}
