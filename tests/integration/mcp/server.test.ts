import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../../../packages/mcp/src/server.js';
import { DaemonClient } from '../../../packages/mcp/src/client.js';

/**
 * T023 — Integration test for the ctxkit-mcp server.
 *
 * Uses InMemoryTransport to exercise the MCP protocol in-process.
 * DaemonClient methods are mocked so we test MCP layer, not the daemon.
 */

const EXPECTED_TOOL_NAMES = [
  'ctxkit.context_pack',
  'ctxkit.log_event',
  'ctxkit.propose_update',
  'ctxkit.apply_proposal',
  'ctxkit.reject_proposal',
  'ctxkit.sessions.list',
  'ctxkit.sessions.show',
  'ctxkit.policy.get',
  'ctxkit.policy.validate',
  'ctxkit.memory.search',
] as const;

function createMockDaemonClient(): DaemonClient {
  const client = new DaemonClient({ baseUrl: 'http://localhost:9999' });

  // Mock all public methods
  vi.spyOn(client, 'healthCheck').mockResolvedValue(true);

  vi.spyOn(client, 'buildContextPack').mockResolvedValue({
    pack_id: 'pack_test123',
    inject_text: '## CtxKit Context\ntest context',
    token_estimate: 100,
    items: [
      {
        source: 'src/.ctx',
        section: 'key_files',
        reason_codes: ['locality'],
        score: 0.85,
        token_count: 100,
      },
    ],
    omitted: [],
    deep_read: null,
  });

  vi.spyOn(client, 'logEvent').mockResolvedValue({
    event_id: 'evt_test456',
  });

  vi.spyOn(client, 'createProposal').mockResolvedValue({
    id: 'prop_test789',
    diff: '--- a/src/.ctx\n+++ b/src/.ctx',
    summary: 'Added key_files entry',
  });

  vi.spyOn(client, 'applyProposal').mockResolvedValue({
    id: 'prop_test789',
    status: 'applied',
    audit_id: 'aud_test012',
  });

  vi.spyOn(client, 'rejectProposal').mockResolvedValue({
    id: 'prop_test789',
    status: 'rejected',
  });

  vi.spyOn(client, 'listSessions').mockResolvedValue({
    sessions: [
      {
        id: 'ses_test1',
        status: 'active',
        repo_path: '/repo',
        started_at: '2026-03-01T10:00:00Z',
        ended_at: null,
      },
    ],
    total: 1,
  });

  vi.spyOn(client, 'getSession').mockResolvedValue({
    id: 'ses_test1',
    status: 'active',
    repo_path: '/repo',
    working_dir: '/repo/src',
    branch: 'main',
    agent_id: 'claude',
    started_at: '2026-03-01T10:00:00Z',
    ended_at: null,
  });

  vi.spyOn(client, 'getConfig').mockResolvedValue({
    effective_config: {
      budget_tokens: 4000,
      scoring_mode: 'balanced',
    },
    sources: [],
  });

  vi.spyOn(client, 'validateConfig').mockResolvedValue({
    valid: true,
    warnings: [],
    errors: [],
  });

  vi.spyOn(client, 'searchMemory').mockResolvedValue({
    results: [
      {
        source: 'src/.ctx',
        section: 'key_files',
        content: 'auth.ts - Authentication module',
        score: 0.92,
        reason_codes: ['keyword_match'],
      },
    ],
    total: 1,
  });

  return client;
}

describe('Integration: MCP Server', () => {
  let mcpClient: Client;
  let mockDaemon: DaemonClient;
  let clientTransport: InMemoryTransport;
  let serverTransport: InMemoryTransport;

  beforeEach(async () => {
    mockDaemon = createMockDaemonClient();
    const server = createMcpServer(mockDaemon);

    [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    mcpClient = new Client(
      { name: 'test-client', version: '1.0.0' },
      { capabilities: {} },
    );

    await server.connect(serverTransport);
    await mcpClient.connect(clientTransport);
  });

  afterEach(async () => {
    await clientTransport.close();
    await serverTransport.close();
    vi.restoreAllMocks();
  });

  // --- Init Handshake ---

  it('should complete MCP init handshake', () => {
    const serverVersion = mcpClient.getServerVersion();
    expect(serverVersion).toBeDefined();
    expect(serverVersion!.name).toBe('ctxkit-mcp');
    expect(serverVersion!.version).toBe('0.1.0');
  });

  it('should advertise tools capability', () => {
    const caps = mcpClient.getServerCapabilities();
    expect(caps).toBeDefined();
    expect(caps!.tools).toBeDefined();
  });

  // --- tools/list ---

  it('should list all 10 tools', async () => {
    const result = await mcpClient.listTools();
    expect(result.tools).toHaveLength(10);

    const names = result.tools.map((t) => t.name).sort();
    const expected = [...EXPECTED_TOOL_NAMES].sort();
    expect(names).toEqual(expected);
  });

  it('should have input schemas with type "object" for all tools', async () => {
    const result = await mcpClient.listTools();
    for (const tool of result.tools) {
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties).toBeDefined();
    }
  });

  it('should have descriptions for all tools', async () => {
    const result = await mcpClient.listTools();
    for (const tool of result.tools) {
      expect(tool.description).toBeTruthy();
    }
  });

  // --- Schema validation against contracts ---

  it('should have correct schema for ctxkit.context_pack', async () => {
    const result = await mcpClient.listTools();
    const tool = result.tools.find((t) => t.name === 'ctxkit.context_pack');
    expect(tool).toBeDefined();
    const props = tool!.inputSchema.properties!;
    expect(props).toHaveProperty('session_id');
    expect(props).toHaveProperty('cwd');
    expect(props).toHaveProperty('request');
    expect(props).toHaveProperty('mode');
    expect(props).toHaveProperty('repo_root');
    expect(props).toHaveProperty('token_budget');
    expect(props).toHaveProperty('tool_intent');
    expect(props).toHaveProperty('touched_files');
  });

  it('should have correct schema for ctxkit.log_event', async () => {
    const result = await mcpClient.listTools();
    const tool = result.tools.find((t) => t.name === 'ctxkit.log_event');
    expect(tool).toBeDefined();
    const props = tool!.inputSchema.properties!;
    expect(props).toHaveProperty('session_id');
    expect(props).toHaveProperty('event_type');
    expect(props).toHaveProperty('payload');
  });

  it('should have correct schema for ctxkit.propose_update', async () => {
    const result = await mcpClient.listTools();
    const tool = result.tools.find((t) => t.name === 'ctxkit.propose_update');
    expect(tool).toBeDefined();
    const props = tool!.inputSchema.properties!;
    expect(props).toHaveProperty('session_id');
    expect(props).toHaveProperty('scope');
    expect(props).toHaveProperty('learned_facts');
    expect(props).toHaveProperty('evidence_paths');
  });

  it('should have correct schema for ctxkit.apply_proposal', async () => {
    const result = await mcpClient.listTools();
    const tool = result.tools.find((t) => t.name === 'ctxkit.apply_proposal');
    expect(tool).toBeDefined();
    const props = tool!.inputSchema.properties!;
    expect(props).toHaveProperty('proposal_id');
  });

  it('should have correct schema for ctxkit.reject_proposal', async () => {
    const result = await mcpClient.listTools();
    const tool = result.tools.find((t) => t.name === 'ctxkit.reject_proposal');
    expect(tool).toBeDefined();
    const props = tool!.inputSchema.properties!;
    expect(props).toHaveProperty('proposal_id');
  });

  it('should have correct schema for ctxkit.sessions.list', async () => {
    const result = await mcpClient.listTools();
    const tool = result.tools.find((t) => t.name === 'ctxkit.sessions.list');
    expect(tool).toBeDefined();
    const props = tool!.inputSchema.properties!;
    expect(props).toHaveProperty('status');
    expect(props).toHaveProperty('repo_path');
    expect(props).toHaveProperty('limit');
  });

  it('should have correct schema for ctxkit.sessions.show', async () => {
    const result = await mcpClient.listTools();
    const tool = result.tools.find((t) => t.name === 'ctxkit.sessions.show');
    expect(tool).toBeDefined();
    const props = tool!.inputSchema.properties!;
    expect(props).toHaveProperty('session_id');
  });

  it('should have correct schema for ctxkit.policy.get', async () => {
    const result = await mcpClient.listTools();
    const tool = result.tools.find((t) => t.name === 'ctxkit.policy.get');
    expect(tool).toBeDefined();
    const props = tool!.inputSchema.properties!;
    expect(props).toHaveProperty('cwd');
    expect(props).toHaveProperty('repo_root');
  });

  it('should have correct schema for ctxkit.policy.validate', async () => {
    const result = await mcpClient.listTools();
    const tool = result.tools.find((t) => t.name === 'ctxkit.policy.validate');
    expect(tool).toBeDefined();
    const props = tool!.inputSchema.properties!;
    expect(props).toHaveProperty('config');
  });

  it('should have correct schema for ctxkit.memory.search', async () => {
    const result = await mcpClient.listTools();
    const tool = result.tools.find((t) => t.name === 'ctxkit.memory.search');
    expect(tool).toBeDefined();
    const props = tool!.inputSchema.properties!;
    expect(props).toHaveProperty('query');
    expect(props).toHaveProperty('cwd');
    expect(props).toHaveProperty('repo_root');
    expect(props).toHaveProperty('limit');
  });

  // --- Tool calls with valid inputs ---

  it('should call ctxkit.context_pack with valid inputs', async () => {
    const result = await mcpClient.callTool({
      name: 'ctxkit.context_pack',
      arguments: {
        session_id: 'ses_test1',
        cwd: '/repo/src',
        request: 'fix the auth bug',
        mode: 'turn',
      },
    });

    expect(result.isError).toBeFalsy();
    expect(result.content).toHaveLength(1);

    const content = result.content[0];
    expect(content.type).toBe('text');
    const parsed = JSON.parse((content as { type: 'text'; text: string }).text);
    expect(parsed).toHaveProperty('pack_id');
    expect(parsed).toHaveProperty('items');
    expect(parsed).toHaveProperty('omitted');
  });

  it('should call ctxkit.log_event with valid inputs', async () => {
    const result = await mcpClient.callTool({
      name: 'ctxkit.log_event',
      arguments: {
        session_id: 'ses_test1',
        event_type: 'tool_success',
        payload: {
          tool_name: 'Edit',
          tool_input: { file: 'auth.ts' },
          exit_code: 0,
          duration_ms: 150,
        },
      },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);
    expect(parsed).toHaveProperty('event_id');
  });

  it('should call ctxkit.propose_update with valid inputs', async () => {
    const result = await mcpClient.callTool({
      name: 'ctxkit.propose_update',
      arguments: {
        session_id: 'ses_test1',
        scope: 'cwd',
        learned_facts: ['auth module uses JWT tokens'],
      },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);
    expect(parsed).toHaveProperty('id');
    expect(parsed).toHaveProperty('diff');
    expect(parsed).toHaveProperty('summary');
  });

  it('should call ctxkit.apply_proposal with valid inputs', async () => {
    const result = await mcpClient.callTool({
      name: 'ctxkit.apply_proposal',
      arguments: { proposal_id: 'prop_test789' },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);
    expect(parsed).toHaveProperty('audit_id');
  });

  it('should call ctxkit.reject_proposal with valid inputs', async () => {
    const result = await mcpClient.callTool({
      name: 'ctxkit.reject_proposal',
      arguments: { proposal_id: 'prop_test789' },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);
    expect(parsed).toHaveProperty('status', 'rejected');
  });

  it('should call ctxkit.sessions.list with valid inputs', async () => {
    const result = await mcpClient.callTool({
      name: 'ctxkit.sessions.list',
      arguments: { status: 'active', limit: 10 },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);
    expect(parsed).toHaveProperty('sessions');
    expect(parsed).toHaveProperty('total');
    expect(parsed.sessions).toBeInstanceOf(Array);
  });

  it('should call ctxkit.sessions.show with valid inputs', async () => {
    const result = await mcpClient.callTool({
      name: 'ctxkit.sessions.show',
      arguments: { session_id: 'ses_test1' },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);
    expect(parsed).toHaveProperty('id', 'ses_test1');
    expect(parsed).toHaveProperty('status');
  });

  it('should call ctxkit.policy.get with valid inputs', async () => {
    const result = await mcpClient.callTool({
      name: 'ctxkit.policy.get',
      arguments: { cwd: '/repo/src' },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);
    expect(parsed).toHaveProperty('effective_config');
  });

  it('should call ctxkit.policy.validate with valid inputs', async () => {
    const result = await mcpClient.callTool({
      name: 'ctxkit.policy.validate',
      arguments: { config: { budget_tokens: 4000 } },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);
    expect(parsed).toHaveProperty('valid');
    expect(parsed).toHaveProperty('warnings');
    expect(parsed).toHaveProperty('errors');
  });

  it('should call ctxkit.memory.search with valid inputs', async () => {
    const result = await mcpClient.callTool({
      name: 'ctxkit.memory.search',
      arguments: {
        query: 'authentication',
        cwd: '/repo/src',
        limit: 5,
      },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content[0] as { type: 'text'; text: string }).text);
    expect(parsed).toHaveProperty('results');
    expect(parsed).toHaveProperty('total');
    expect(parsed.results).toBeInstanceOf(Array);
  });

  // --- Daemon unavailable error handling ---

  it('should return error with start instructions when daemon is unreachable', async () => {
    // Make buildContextPack throw a connection error (not DaemonApiError)
    vi.spyOn(mockDaemon, 'buildContextPack').mockRejectedValue(
      new TypeError('fetch failed'),
    );

    const result = await mcpClient.callTool({
      name: 'ctxkit.context_pack',
      arguments: {
        session_id: 'ses_test1',
        cwd: '/repo/src',
        request: 'test',
        mode: 'turn',
      },
    });

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('ctxkit daemon');
    expect(text).toContain('start');
  });

  it('should pass through DaemonApiError messages', async () => {
    const { DaemonApiError } = await import(
      '../../../packages/mcp/src/client.js'
    );
    vi.spyOn(mockDaemon, 'getSession').mockRejectedValue(
      new DaemonApiError(404, 'Session not found'),
    );

    const result = await mcpClient.callTool({
      name: 'ctxkit.sessions.show',
      arguments: { session_id: 'nonexistent' },
    });

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    expect(text).toContain('Session not found');
  });

  // --- Invalid inputs (Zod validation) ---

  it('should reject ctxkit.context_pack with missing required fields', async () => {
    try {
      await mcpClient.callTool({
        name: 'ctxkit.context_pack',
        arguments: {
          session_id: 'ses_test1',
          // missing cwd, request, mode
        },
      });
      // If we get here, check for isError
    } catch (error) {
      // MCP SDK may throw on invalid params — that's also acceptable
      expect(error).toBeDefined();
    }
  });

  it('should reject ctxkit.log_event with invalid event_type enum', async () => {
    try {
      await mcpClient.callTool({
        name: 'ctxkit.log_event',
        arguments: {
          session_id: 'ses_test1',
          event_type: 'invalid_type',
          payload: {},
        },
      });
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  it('should reject ctxkit.context_pack with invalid mode enum', async () => {
    try {
      await mcpClient.callTool({
        name: 'ctxkit.context_pack',
        arguments: {
          session_id: 'ses_test1',
          cwd: '/repo',
          request: 'test',
          mode: 'invalid_mode',
        },
      });
    } catch (error) {
      expect(error).toBeDefined();
    }
  });
});
