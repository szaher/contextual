import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { DaemonApiError, DAEMON_UNAVAILABLE_MESSAGE } from '../client.js';
import type { DaemonClient } from '../client.js';

export function registerEventsTool(server: McpServer, client: DaemonClient): void {
  server.tool(
    'ctxkit.log_event',
    'Record a tool call or session event to the timeline',
    {
      session_id: z.string().describe('Active CtxKit session ID'),
      event_type: z
        .enum(['tool_success', 'tool_failure', 'session_close', 'proposal_trigger'])
        .describe('Type of event'),
      payload: z
        .object({
          tool_name: z.string().optional(),
          tool_input: z.record(z.unknown()).optional(),
          tool_response: z.record(z.unknown()).optional(),
          error: z.string().optional(),
          file_paths: z.array(z.string()).optional(),
          exit_code: z.number().optional(),
          duration_ms: z.number().optional(),
        })
        .describe('Event payload'),
    },
    async (args) => {
      try {
        const result = await client.logEvent(args.session_id, {
          event_type: args.event_type,
          tool_name: args.payload.tool_name || 'unknown',
          tool_input: args.payload.tool_input || {},
          tool_response: args.payload.tool_response,
          exit_code: args.payload.exit_code,
          duration_ms: args.payload.duration_ms,
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
