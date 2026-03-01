import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { DaemonApiError, DAEMON_UNAVAILABLE_MESSAGE } from '../client.js';
import type { DaemonClient } from '../client.js';

export function registerProposalTools(server: McpServer, client: DaemonClient): void {
  server.tool(
    'ctxkit.propose_update',
    'Generate a .ctx update proposal from session activity',
    {
      session_id: z.string().describe('Active CtxKit session ID'),
      scope: z.enum(['cwd', 'repo']).default('cwd').describe('Proposal scope'),
      learned_facts: z.array(z.string()).optional().describe('Facts learned during session'),
      evidence_paths: z.array(z.string()).optional().describe('File paths supporting the proposal'),
    },
    async (args) => {
      try {
        const result = await client.createProposal({
          session_id: args.session_id,
          scope: args.scope,
          learned_facts: args.learned_facts,
          evidence_paths: args.evidence_paths,
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
    'ctxkit.apply_proposal',
    'Apply an approved .ctx update proposal',
    {
      proposal_id: z.string().describe('Proposal ID to apply'),
    },
    async (args) => {
      try {
        const result = await client.applyProposal(args.proposal_id);
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
    'ctxkit.reject_proposal',
    'Reject a pending .ctx update proposal',
    {
      proposal_id: z.string().describe('Proposal ID to reject'),
    },
    async (args) => {
      try {
        const result = await client.rejectProposal(args.proposal_id);
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
