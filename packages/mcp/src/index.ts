#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.js';

async function main(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('ctxkit-mcp server started on stdio');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
