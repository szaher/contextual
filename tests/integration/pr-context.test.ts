import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { collectPrContext, renderPrMarkdown as renderMarkdown, renderPrJson as renderJson } from '@ctxkit/core';
import type { SessionData } from '@ctxkit/core';

/**
 * T102 -- Integration tests: PR Context
 *
 * Tests:
 *   1. Collector extracts correct prompt chain from session data
 *   2. Collector classifies agent decisions
 *   3. Renderer produces valid markdown
 *   4. Renderer produces valid JSON
 *   5. Stats are accurate
 *   6. Git range scoping works
 */

function createTestSession(overrides: Partial<SessionData> = {}): SessionData {
  return {
    id: 'sess_test001',
    repo_path: '/tmp/test-repo',
    branch: 'feature/test',
    agent_id: 'agent-claude',
    started_at: '2026-03-15T10:00:00Z',
    ended_at: '2026-03-15T11:00:00Z',
    events: [
      {
        id: 'evt_001',
        request_text: 'Fix the authentication bug in the login form',
        token_count: 1500,
        created_at: '2026-03-15T10:00:00Z',
        context_pack: JSON.stringify({
          items: [
            {
              source: 'src/auth/.ctx',
              section: 'key_files',
              score: 0.85,
              content: 'JWT auth middleware',
            },
          ],
        }),
      },
      {
        id: 'evt_002',
        request_text: 'Now add tests for the fix',
        token_count: 800,
        created_at: '2026-03-15T10:30:00Z',
        context_pack: null,
      },
    ],
    tool_events: [
      {
        tool_name: 'Read',
        tool_input: JSON.stringify({ file_path: 'src/auth/login.ts' }),
        tool_response: 'file contents...',
        event_type: 'tool_success',
        duration_ms: 50,
        created_at: '2026-03-15T10:01:00Z',
      },
      {
        tool_name: 'Edit',
        tool_input: JSON.stringify({ file_path: 'src/auth/login.ts', old_string: 'bug', new_string: 'fix' }),
        tool_response: 'success',
        event_type: 'tool_success',
        duration_ms: 30,
        created_at: '2026-03-15T10:05:00Z',
      },
      {
        tool_name: 'Write',
        tool_input: JSON.stringify({ file_path: 'tests/auth.test.ts' }),
        tool_response: 'success',
        event_type: 'tool_success',
        duration_ms: 40,
        created_at: '2026-03-15T10:35:00Z',
      },
    ],
    ...overrides,
  };
}

describe('Integration: PR Context (T102)', () => {
  let tmpDir: string;
  let repoDir: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxl-pr-context-'));
    repoDir = join(tmpDir, 'repo');
    mkdirSync(repoDir, { recursive: true });
    mkdirSync(join(repoDir, 'src', 'auth'), { recursive: true });

    writeFileSync(join(repoDir, 'src', 'auth', 'login.ts'), 'export function login() {}\n');

    execSync('git init', { cwd: repoDir, stdio: 'ignore' });
    execSync('git add .', { cwd: repoDir, stdio: 'ignore' });
    execSync('git -c user.name="test" -c user.email="t@t.co" commit -m "init"', {
      cwd: repoDir,
      stdio: 'ignore',
    });
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ────────────────────────────────────────────────────────────────
  // 1. Prompt chain extraction
  // ────────────────────────────────────────────────────────────────
  describe('prompt chain collection', () => {
    it('should extract prompts in order from session events', () => {
      const session = createTestSession();
      const prContext = collectPrContext([session], { repoRoot: repoDir });

      expect(prContext.prompt_chain.length).toBe(2);
      expect(prContext.prompt_chain[0].index).toBe(1);
      expect(prContext.prompt_chain[0].prompt).toContain('authentication bug');
      expect(prContext.prompt_chain[1].index).toBe(2);
      expect(prContext.prompt_chain[1].prompt).toContain('add tests');
    });

    it('should truncate long prompts to 200 chars', () => {
      const longPrompt = 'A'.repeat(300);
      const session = createTestSession({
        events: [{
          id: 'evt_long',
          request_text: longPrompt,
          token_count: 100,
          created_at: '2026-03-15T10:00:00Z',
          context_pack: null,
        }],
      });

      const prContext = collectPrContext([session], { repoRoot: repoDir });

      expect(prContext.prompt_chain[0].prompt.length).toBe(200);
      expect(prContext.prompt_chain[0].truncated).toBe(true);
    });

    it('should extract tools used from tool events', () => {
      const session = createTestSession();
      const prContext = collectPrContext([session], { repoRoot: repoDir });

      expect(prContext.prompt_chain[0].tools_used.length).toBeGreaterThan(0);
    });

    it('should extract files touched from tool events', () => {
      const session = createTestSession();
      const prContext = collectPrContext([session], { repoRoot: repoDir });

      const allFiles = prContext.prompt_chain.flatMap((p) => p.files_touched);
      expect(allFiles).toContain('src/auth/login.ts');
    });
  });

  // ────────────────────────────────────────────────────────────────
  // 2. Decision classification
  // ────────────────────────────────────────────────────────────────
  describe('agent decision classification', () => {
    it('should classify Edit/Write tool calls as decisions', () => {
      const session = createTestSession();
      const prContext = collectPrContext([session], { repoRoot: repoDir });

      expect(prContext.agent_decisions.length).toBeGreaterThan(0);
    });

    it('should deduplicate decisions for the same file', () => {
      const session = createTestSession({
        tool_events: [
          {
            tool_name: 'Edit',
            tool_input: JSON.stringify({ file_path: 'src/app.ts' }),
            tool_response: null,
            event_type: 'tool_success',
            duration_ms: 10,
            created_at: '2026-03-15T10:01:00Z',
          },
          {
            tool_name: 'Edit',
            tool_input: JSON.stringify({ file_path: 'src/app.ts' }),
            tool_response: null,
            event_type: 'tool_success',
            duration_ms: 10,
            created_at: '2026-03-15T10:02:00Z',
          },
        ],
      });

      const prContext = collectPrContext([session], { repoRoot: repoDir });

      const appDecisions = prContext.agent_decisions.filter((d) => d.decision.includes('src/app.ts'));
      expect(appDecisions.length).toBe(1);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // 3. Context used
  // ────────────────────────────────────────────────────────────────
  describe('context used collection', () => {
    it('should extract .ctx files from context packs', () => {
      const session = createTestSession();
      const prContext = collectPrContext([session], { repoRoot: repoDir });

      expect(prContext.context_used.length).toBe(1);
      expect(prContext.context_used[0].ctx_path).toBe('src/auth/.ctx');
      expect(prContext.context_used[0].score).toBe(0.85);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // 4. Renderer - Markdown
  // ────────────────────────────────────────────────────────────────
  describe('markdown rendering', () => {
    it('should produce valid markdown with all sections', () => {
      const session = createTestSession();
      const prContext = collectPrContext([session], { repoRoot: repoDir });
      const markdown = renderMarkdown(prContext);

      expect(markdown).toContain('## Change Context');
      expect(markdown).toContain('### Summary');
      expect(markdown).toContain('### Prompt Chain');
      expect(markdown).toContain('### Agent Decisions');
      expect(markdown).toContain('### Context References');
      expect(markdown).toContain('### Stats');
      expect(markdown).toContain('sess_test001');
    });

    it('should contain markdown tables for prompt chain', () => {
      const session = createTestSession();
      const prContext = collectPrContext([session], { repoRoot: repoDir });
      const markdown = renderMarkdown(prContext);

      expect(markdown).toContain('| # | Timestamp |');
      expect(markdown).toContain('|---|-----------|');
    });

    it('should include stats in markdown output', () => {
      const session = createTestSession();
      const prContext = collectPrContext([session], { repoRoot: repoDir });
      const markdown = renderMarkdown(prContext);

      expect(markdown).toContain('**Prompts**: 2');
      expect(markdown).toContain('**Tool calls**: 3');
    });
  });

  // ────────────────────────────────────────────────────────────────
  // 5. Renderer - JSON
  // ────────────────────────────────────────────────────────────────
  describe('json rendering', () => {
    it('should produce valid JSON', () => {
      const session = createTestSession();
      const prContext = collectPrContext([session], { repoRoot: repoDir });
      const jsonStr = renderJson(prContext);

      expect(() => JSON.parse(jsonStr)).not.toThrow();
      const parsed = JSON.parse(jsonStr);

      expect(parsed.version).toBe(1);
      expect(parsed.session_ids).toContain('sess_test001');
      expect(parsed.prompt_chain.length).toBe(2);
      expect(parsed.stats.total_prompts).toBe(2);
    });

    it('should round-trip through JSON', () => {
      const session = createTestSession();
      const prContext = collectPrContext([session], { repoRoot: repoDir });
      const jsonStr = renderJson(prContext);
      const parsed = JSON.parse(jsonStr);
      const re = JSON.stringify(parsed, null, 2);

      expect(re).toBe(jsonStr);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // 6. Stats computation
  // ────────────────────────────────────────────────────────────────
  describe('stats accuracy', () => {
    it('should compute accurate prompt and tool counts', () => {
      const session = createTestSession();
      const prContext = collectPrContext([session], { repoRoot: repoDir });

      expect(prContext.stats.total_prompts).toBe(2);
      expect(prContext.stats.total_tool_calls).toBe(3);
      expect(prContext.stats.total_tokens_used).toBe(2300); // 1500 + 800
    });

    it('should compute session duration', () => {
      const session = createTestSession();
      const prContext = collectPrContext([session], { repoRoot: repoDir });

      // 10:00 to 11:00 = 60 minutes = 3600000ms
      expect(prContext.stats.session_duration_ms).toBe(3600000);
    });

    it('should aggregate stats across multiple sessions', () => {
      const session1 = createTestSession({ id: 'sess_001' });
      const session2 = createTestSession({
        id: 'sess_002',
        started_at: '2026-03-15T12:00:00Z',
        ended_at: '2026-03-15T12:30:00Z',
      });

      const prContext = collectPrContext([session1, session2], { repoRoot: repoDir });

      expect(prContext.stats.total_prompts).toBe(4);
      expect(prContext.stats.total_tool_calls).toBe(6);
      expect(prContext.stats.total_tokens_used).toBe(4600);
      expect(prContext.session_ids).toContain('sess_001');
      expect(prContext.session_ids).toContain('sess_002');
    });
  });

  // ────────────────────────────────────────────────────────────────
  // 7. Summary and motivation generation
  // ────────────────────────────────────────────────────────────────
  describe('summary and motivation', () => {
    it('should generate summary from session data', () => {
      const session = createTestSession();
      const prContext = collectPrContext([session], { repoRoot: repoDir });

      expect(prContext.summary).toContain('1 session(s)');
      expect(prContext.summary).toContain('authentication bug');
    });

    it('should use first prompt as motivation', () => {
      const session = createTestSession();
      const prContext = collectPrContext([session], { repoRoot: repoDir });

      expect(prContext.motivation).toContain('authentication bug');
    });
  });
});
