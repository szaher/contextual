import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DaemonClient } from './client.js';
import { registerContextPackTool } from './tools/context-pack.js';
import { registerEventsTool } from './tools/events.js';
import { registerProposalTools } from './tools/proposals.js';
import { registerSessionTools } from './tools/sessions.js';
import { registerPolicyTools } from './tools/policy.js';
import { registerMemoryTool } from './tools/memory.js';

const VERSION = '0.1.0';

export function createMcpServer(existingClient?: DaemonClient): McpServer {
  const server = new McpServer({
    name: 'ctxkit-mcp',
    version: VERSION,
  });

  const client = existingClient || new DaemonClient();

  // Register all 10 tools
  registerContextPackTool(server, client);
  registerEventsTool(server, client);
  registerProposalTools(server, client);
  registerSessionTools(server, client);
  registerPolicyTools(server, client);
  registerMemoryTool(server, client);

  return server;
}
