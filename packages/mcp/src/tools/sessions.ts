import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { DaemonApiError, DAEMON_UNAVAILABLE_MESSAGE } from '../client.js';
import type { DaemonClient } from '../client.js';

export function registerSessionTools(server: McpServer, client: DaemonClient): void {
  server.tool(
    'ctxkit.sessions.list',
    'List CtxKit sessions',
    {
      status: z.enum(['active', 'completed']).optional(),
      repo_path: z.string().optional(),
      limit: z.number().positive().optional().default(20),
    },
    async (args) => {
      try {
        const result = await client.listSessions({
          status: args.status,
          repo_path: args.repo_path,
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

  server.tool(
    'ctxkit.sessions.show',
    'Get details for a specific session',
    {
      session_id: z.string(),
    },
    async (args) => {
      try {
        const result = await client.getSession(args.session_id);
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
