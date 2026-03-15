import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DaemonClient } from '../client.js';

export function registerWriteTools(server: McpServer, client: DaemonClient): void {
  server.tool(
    'ctxkit.ctx_write',
    'Write to a .ctx file with automatic locking, versioning, and conflict detection',
    {
      ctx_path: z.string().describe('Path to .ctx file'),
      updates: z.record(z.unknown()).describe('Sections to update (partial .ctx content)'),
      reason: z.string().max(200).describe('Why the change is being made'),
      author: z.string().describe('Author identity (agent:<model> or developer:<username>)'),
      session_id: z.string().optional().describe('Current session ID'),
    },
    async ({ ctx_path, updates, reason, author, session_id }) => {
      try {
        const result = await client.post('/api/v1/ctx/write', {
          ctx_path,
          updates,
          reason,
          author,
          session_id,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: message,
              }),
            },
          ],
          isError: true,
        };
      }
    },
  );
}
