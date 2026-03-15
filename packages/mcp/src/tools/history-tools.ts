import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DaemonClient } from '../client.js';
import { z } from 'zod';

export function registerHistoryTools(server: McpServer, client: DaemonClient): void {
  server.tool(
    'ctxkit.ctx_history',
    'Get version history for a .ctx file, including timestamps, authors, and changes',
    {
      repo_root: z.string().describe('Absolute path to repository root'),
      ctx_path: z.string().describe('Relative path to .ctx file'),
      count: z.number().optional().default(10).describe('Number of history entries'),
      include_archived: z.boolean().optional().default(false).describe('Include archived entries'),
    },
    async ({ repo_root, ctx_path, count, include_archived }) => {
      const params = new URLSearchParams({
        repo_root,
        ctx_path,
        count: String(count),
        include_archived: String(include_archived),
      });

      const result = await client.get(`/api/v1/history?${params.toString()}`);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    },
  );
}
