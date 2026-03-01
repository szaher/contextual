import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { DaemonApiError, DAEMON_UNAVAILABLE_MESSAGE } from '../client.js';
import type { DaemonClient } from '../client.js';

export function registerPolicyTools(server: McpServer, client: DaemonClient): void {
  server.tool(
    'ctxkit.policy.get',
    'Return the effective merged configuration for the current workspace',
    {
      cwd: z.string(),
      repo_root: z.string().optional(),
    },
    async (args) => {
      try {
        const result = await client.getConfig({
          cwd: args.cwd,
          repo_root: args.repo_root,
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
    'ctxkit.policy.validate',
    'Validate configuration schema correctness',
    {
      config: z.record(z.unknown()),
    },
    async (args) => {
      try {
        const result = await client.validateConfig(args.config);
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
