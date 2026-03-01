import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { DaemonApiError, DAEMON_UNAVAILABLE_MESSAGE } from '../client.js';
import type { DaemonClient } from '../client.js';

export function registerContextPackTool(server: McpServer, client: DaemonClient): void {
  server.tool(
    'ctxkit.context_pack',
    'Build a Context Pack for a request or tool invocation',
    {
      session_id: z.string().describe('Active CtxKit session ID'),
      cwd: z.string().describe('Current working directory'),
      request: z.string().describe('User request text or tool intent description'),
      mode: z.enum(['turn', 'tool']).describe('Context mode'),
      repo_root: z.string().optional().describe('Repository root path'),
      token_budget: z.number().positive().optional().describe('Max tokens'),
      tool_intent: z
        .object({
          tool_name: z.string(),
          tool_input: z.record(z.unknown()),
        })
        .optional()
        .describe('Tool context for mode=tool'),
      touched_files: z.array(z.string()).optional().describe('Recently modified files'),
    },
    async (args) => {
      try {
        const result = await client.buildContextPack({
          session_id: args.session_id,
          request_text: args.request,
          working_dir: args.cwd,
          touched_files: args.touched_files,
          budget_tokens: args.token_budget,
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
