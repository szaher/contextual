import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { serve } from '@hono/node-server';
import type { ServerType } from '@hono/node-server';
import { createApp } from '../../packages/daemon/src/server.js';
import { openDatabase } from '../../packages/daemon/src/store/db.js';
import { Client } from '@modelcontextprotocol/sdk/client';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../../packages/mcp/src/server.js';
import { DaemonClient } from '../../packages/mcp/src/client.js';
import type Database from 'better-sqlite3';

/**
 * T024 — E2E test for the MCP server with a real daemon.
 *
 * Starts a real daemon on a random port, connects MCP server to it,
 * and exercises the full data flow: create session → log events →
 * list/show sessions → verify end-to-end.
 */

function waitForListening(server: ServerType): Promise<number> {
  return new Promise((resolve, reject) => {
    server.on('listening', () => {
      const addr = server.address();
      if (typeof addr === 'object' && addr !== null) {
        resolve(addr.port);
      } else {
        reject(new Error('Could not get server port'));
      }
    });
    server.on('error', reject);
  });
}

describe('E2E: MCP Server with Daemon', () => {
  let tmpDir: string;
  let fixtureDir: string;
  let db: Database.Database;
  let daemonServer: ServerType;
  let daemonPort: number;
  let mcpClient: Client;
  let clientTransport: InMemoryTransport;
  let serverTransport: InMemoryTransport;

  beforeAll(async () => {
    // Create temp directories
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxl-e2e-mcp-'));

    // Create a simple fixture repo with .ctx
    fixtureDir = join(tmpDir, 'repo');
    mkdirSync(fixtureDir, { recursive: true });
    mkdirSync(join(fixtureDir, 'src'), { recursive: true });
    writeFileSync(
      join(fixtureDir, '.ctx'),
      `---
decisions:
  - id: tech-stack
    title: "TypeScript + Node.js"
    status: active
    tags: [typescript, nodejs]
    body: "Using TypeScript 5.x with Node.js 20+"
key_files:
  - id: main-entry
    path: src/index.ts
    role: "Main application entry point"
    tags: [entry, typescript]
`,
    );
    writeFileSync(
      join(fixtureDir, 'src', 'index.ts'),
      'export const main = () => {};\n',
    );

    // Start daemon on random port
    const dbPath = join(tmpDir, 'test.db');
    db = openDatabase(dbPath);
    const app = createApp({ db, startedAt: new Date() });

    daemonServer = serve({
      fetch: app.fetch,
      port: 0,
      hostname: '127.0.0.1',
    });

    daemonPort = await waitForListening(daemonServer);

    // Create MCP server with DaemonClient pointing to our test daemon
    const daemonClient = new DaemonClient({
      baseUrl: `http://127.0.0.1:${daemonPort}`,
    });
    const mcpServer = createMcpServer(daemonClient);

    // Connect via InMemoryTransport
    [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    mcpClient = new Client(
      { name: 'e2e-test-client', version: '1.0.0' },
      { capabilities: {} },
    );

    await mcpServer.connect(serverTransport);
    await mcpClient.connect(clientTransport);
  });

  afterAll(async () => {
    await clientTransport?.close();
    await serverTransport?.close();
    daemonServer?.close();
    db?.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function parseToolResult(
    result: Awaited<ReturnType<typeof mcpClient.callTool>>,
  ): unknown {
    const content = result.content[0];
    if (content.type !== 'text')
      throw new Error('Expected text content');
    return JSON.parse(content.text);
  }

  it('should list all 10 tools', async () => {
    const result = await mcpClient.listTools();
    expect(result.tools).toHaveLength(10);
  });

  it('should create a session via daemon and list via MCP tool', async () => {
    // Create session directly via daemon HTTP API
    const res = await fetch(
      `http://127.0.0.1:${daemonPort}/api/v1/sessions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo_path: fixtureDir,
          working_dir: fixtureDir,
          branch: 'main',
          agent_id: 'e2e-test',
        }),
      },
    );
    expect(res.ok).toBe(true);
    const session = (await res.json()) as { id: string; status: string };
    expect(session.id).toMatch(/^sess_/);
    expect(session.status).toBe('active');

    // Now list sessions via MCP tool
    const listResult = await mcpClient.callTool({
      name: 'ctxkit.sessions.list',
      arguments: { limit: 10 },
    });

    expect(listResult.isError).toBeFalsy();
    const listData = parseToolResult(listResult) as {
      sessions: Array<{ id: string; status: string }>;
      total: number;
    };
    expect(listData.total).toBeGreaterThanOrEqual(1);
    expect(listData.sessions.some((s) => s.id === session.id)).toBe(true);
  });

  it('should show session details via MCP tool', async () => {
    // Get session ID from list
    const listResult = await mcpClient.callTool({
      name: 'ctxkit.sessions.list',
      arguments: { limit: 1 },
    });
    const listData = parseToolResult(listResult) as {
      sessions: Array<{ id: string }>;
    };
    const sessionId = listData.sessions[0].id;

    const showResult = await mcpClient.callTool({
      name: 'ctxkit.sessions.show',
      arguments: { session_id: sessionId },
    });

    expect(showResult.isError).toBeFalsy();
    const data = parseToolResult(showResult) as {
      id: string;
      status: string;
      repo_path: string;
    };
    expect(data.id).toBe(sessionId);
    expect(data.status).toBe('active');
    expect(data.repo_path).toBe(fixtureDir);
  });

  it('should log events and verify on session timeline', async () => {
    // Create a fresh session
    const createRes = await fetch(
      `http://127.0.0.1:${daemonPort}/api/v1/sessions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo_path: fixtureDir,
          working_dir: join(fixtureDir, 'src'),
          branch: 'main',
          agent_id: 'event-test',
        }),
      },
    );
    const session = (await createRes.json()) as { id: string };

    // Log events via MCP
    for (const toolName of ['Read', 'Edit', 'Write']) {
      const eventResult = await mcpClient.callTool({
        name: 'ctxkit.log_event',
        arguments: {
          session_id: session.id,
          event_type: 'tool_success',
          payload: {
            tool_name: toolName,
            tool_input: { path: `src/${toolName.toLowerCase()}.ts` },
            exit_code: 0,
            duration_ms: 100,
          },
        },
      });
      expect(eventResult.isError).toBeFalsy();
      const eventData = parseToolResult(eventResult) as {
        event_id: string;
      };
      expect(eventData.event_id).toBeTruthy();
    }

    // Verify events appear on session
    const showResult = await mcpClient.callTool({
      name: 'ctxkit.sessions.show',
      arguments: { session_id: session.id },
    });
    expect(showResult.isError).toBeFalsy();
    const sessionDetail = parseToolResult(showResult) as {
      id: string;
      events: unknown[];
    };
    expect(sessionDetail.id).toBe(session.id);
    expect(sessionDetail.events.length).toBeGreaterThanOrEqual(3);
  });

  it('should validate config via MCP tool', async () => {
    const result = await mcpClient.callTool({
      name: 'ctxkit.policy.validate',
      arguments: { config: { budget_tokens: 4000 } },
    });

    expect(result.isError).toBeFalsy();
    const data = parseToolResult(result) as {
      valid: boolean;
      warnings: unknown[];
      errors: unknown[];
    };
    expect(data.valid).toBe(true);
    expect(data.errors).toEqual([]);
  });

  it('should handle daemon error gracefully for nonexistent session', async () => {
    const result = await mcpClient.callTool({
      name: 'ctxkit.sessions.show',
      arguments: { session_id: 'nonexistent_session' },
    });

    // Should return error without crashing
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toBeTruthy();
  });

  it('should handle full lifecycle: create → events → close → verify', async () => {
    // 1. Create session
    const createRes = await fetch(
      `http://127.0.0.1:${daemonPort}/api/v1/sessions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo_path: fixtureDir,
          working_dir: fixtureDir,
          branch: 'main',
          agent_id: 'lifecycle-test',
        }),
      },
    );
    const session = (await createRes.json()) as { id: string };

    // 2. Log event via MCP
    const eventResult = await mcpClient.callTool({
      name: 'ctxkit.log_event',
      arguments: {
        session_id: session.id,
        event_type: 'tool_success',
        payload: {
          tool_name: 'Bash',
          tool_input: { command: 'npm test' },
          exit_code: 0,
          duration_ms: 3000,
        },
      },
    });
    expect(eventResult.isError).toBeFalsy();

    // 3. Close session via daemon API
    const closeRes = await fetch(
      `http://127.0.0.1:${daemonPort}/api/v1/sessions/${session.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      },
    );
    expect(closeRes.ok).toBe(true);

    // 4. Verify session is completed via MCP
    const showResult = await mcpClient.callTool({
      name: 'ctxkit.sessions.show',
      arguments: { session_id: session.id },
    });
    expect(showResult.isError).toBeFalsy();
    const detail = parseToolResult(showResult) as {
      id: string;
      status: string;
      ended_at: string | null;
    };
    expect(detail.status).toBe('completed');
    expect(detail.ended_at).toBeTruthy();

    // 5. Verify completed session appears in filtered list
    const completedList = await mcpClient.callTool({
      name: 'ctxkit.sessions.list',
      arguments: { status: 'completed' },
    });
    expect(completedList.isError).toBeFalsy();
    const completedData = parseToolResult(completedList) as {
      sessions: Array<{ id: string }>;
      total: number;
    };
    expect(completedData.sessions.some((s) => s.id === session.id)).toBe(
      true,
    );
  });
});
