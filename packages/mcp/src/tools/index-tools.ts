import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DaemonClient } from '../client.js';
import { z } from 'zod';

export function registerIndexTools(server: McpServer, client: DaemonClient): void {
  // ctxkit.index_generate — Generate or regenerate the .ctxl index
  server.tool(
    'ctxkit.index_generate',
    'Generate or regenerate the .ctxl index from all .ctx files in the repository',
    {
      repo_root: z.string().describe('Absolute path to repository root'),
      force: z.boolean().optional().default(false).describe('Force regeneration'),
    },
    async ({ repo_root, force }) => {
      const result = await client.post('/api/v1/index/generate', {
        repo_root,
        force,
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    },
  );

  // ctxkit.index_select — Select .ctx files for a task using the index
  server.tool(
    'ctxkit.index_select',
    'Select context from the .ctxl index for a task, using scored selection with budget constraints',
    {
      repo_root: z.string().describe('Absolute path to repository root'),
      prompt: z.string().describe('Task prompt for context selection'),
      cwd: z.string().optional().describe('Current working directory'),
      budget_tokens: z.number().optional().default(4000).describe('Token budget'),
      touched_files: z.array(z.string()).optional().describe('Files modified in session'),
      pinned: z.array(z.string()).optional().describe('.ctx paths to always include'),
      excluded: z.array(z.string()).optional().describe('.ctx paths to exclude'),
    },
    async ({ repo_root, prompt, cwd, budget_tokens, touched_files, pinned, excluded }) => {
      const result = await client.post('/api/v1/index/select', {
        repo_root,
        prompt,
        cwd: cwd || repo_root,
        budget_tokens,
        touched_files,
        pinned,
        excluded,
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    },
  );
}
