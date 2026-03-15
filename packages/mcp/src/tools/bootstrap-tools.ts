import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DaemonClient } from '../client.js';

export function registerBootstrapTools(server: McpServer, client: DaemonClient): void {
  server.tool(
    'ctxkit.ctx_bootstrap',
    'Analyze a directory and generate a .ctx file proposal',
    {
      target_path: z.string().describe('Directory to analyze'),
      mode: z.enum(['quick', 'full']).optional().default('quick').describe('Analysis mode'),
      dry_run: z.boolean().optional().default(true).describe('Preview without writing'),
      skip_existing: z.boolean().optional().default(true).describe('Skip if .ctx already exists'),
      min_files: z.number().int().optional().default(3).describe('Minimum files to qualify'),
    },
    async ({ target_path, mode, dry_run, skip_existing, min_files }) => {
      try {
        const result = await client.post<{ proposals?: unknown[] }>('/api/v1/bootstrap/analyze', {
          repo_root: target_path,
          target_path: '.',
          mode,
          skip_existing,
          min_files,
        });

        if (!dry_run && result.proposals && result.proposals.length > 0) {
          await client.post('/api/v1/bootstrap/apply', {
            repo_root: target_path,
            proposals: result.proposals,
          });
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ ...result, dry_run }, null, 2),
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ success: false, error: message }),
            },
          ],
          isError: true,
        };
      }
    },
  );
}
