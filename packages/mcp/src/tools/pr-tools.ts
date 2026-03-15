import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DaemonClient } from '../client.js';

export function registerPrTools(server: McpServer, client: DaemonClient): void {
  server.tool(
    'ctxkit.pr_generate',
    'Generate a PR context document from session data',
    {
      session_ids: z.array(z.string()).optional().default([]).describe('Specific session IDs (if empty, uses branch)'),
      git_range: z.string().optional().describe('Git range (e.g., "main..HEAD")'),
      format: z.enum(['markdown', 'json']).optional().default('markdown').describe('Output format'),
      include_full_prompts: z.boolean().optional().default(false).describe('Include full prompt text'),
      link_specs: z.boolean().optional().default(false).describe('Cross-reference spec-kit artifacts'),
    },
    async ({ session_ids, git_range, format, link_specs }) => {
      try {
        const result = await client.post('/api/v1/pr-context/generate', {
          repo_root: process.env.CTXKIT_REPO_ROOT || process.cwd(),
          session_ids: session_ids || [],
          git_range,
          format,
          link_specs,
        });

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: message }),
          }],
          isError: true,
        };
      }
    },
  );
}
