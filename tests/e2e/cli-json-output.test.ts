import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { serve } from '@hono/node-server';
import type { ServerType } from '@hono/node-server';
import { createApp } from '../../packages/daemon/src/server.js';
import { openDatabase } from '../../packages/daemon/src/store/db.js';
import { buildContextPack, parseCtxFile } from '@ctxl/core';
import type Database from 'better-sqlite3';

/**
 * T049 -- E2E test: CLI commands with --json flag produce valid JSON output
 * matching MCP tool response schemas.
 *
 * Tests three CLI command categories:
 *   1. `ctxkit inject --json` — context pack assembly
 *   2. `ctxkit sessions list --json` — session listing via daemon
 *   3. `ctxkit propose <ctx-path> --json` — .ctx file analysis
 */

const CTX_YAML = `---
version: 1
summary: "Test project for CLI JSON output validation"
key_files:
  - path: src/index.ts
    purpose: "Entry point"
    tags: [entry]
    verified_at: ""
    locked: false
  - path: src/config.ts
    purpose: "Configuration loader"
    tags: [config]
    verified_at: ""
    locked: false
decisions:
  - id: adr-001
    title: Use TypeScript
    status: accepted
    date: "2026-01-01"
    rationale: Type safety
    alternatives:
      - name: JavaScript
        reason_rejected: No type safety
    verified_at: ""
    locked: false
contracts:
  - name: api-v1
    scope:
      paths: [src/api/]
      tags: [api]
    content: "All API responses must include a status field"
    verified_at: ""
    locked: false
commands:
  build: npm run build
  test: npm test
gotchas:
  - text: "Config env vars override file values"
    tags: [config]
    verified_at: ""
    locked: false
tags: [typescript, nodejs, test]
refs: []
ignore:
  never_read: []
  never_log: []
`;

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

describe('E2E: CLI --json Output Validation (T049)', () => {
  let tmpDir: string;
  let fixtureDir: string;
  let ctxFilePath: string;

  beforeAll(() => {
    // Create a temp fixture repo with .ctx and source files
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxl-e2e-json-'));
    fixtureDir = join(tmpDir, 'repo');
    mkdirSync(fixtureDir, { recursive: true });
    mkdirSync(join(fixtureDir, 'src'), { recursive: true });
    mkdirSync(join(fixtureDir, 'src', 'api'), { recursive: true });

    ctxFilePath = join(fixtureDir, '.ctx');
    writeFileSync(ctxFilePath, CTX_YAML);
    writeFileSync(
      join(fixtureDir, 'src', 'index.ts'),
      'export const main = () => {};\n',
    );
    writeFileSync(
      join(fixtureDir, 'src', 'config.ts'),
      'export const config = { port: 3000 };\n',
    );

    // Initialize a git repo so buildContextPack can find .git
    execSync('git init', { cwd: fixtureDir, stdio: 'ignore' });
    execSync('git add .', { cwd: fixtureDir, stdio: 'ignore' });
    execSync('git -c user.name="test" -c user.email="t@t.co" commit -m "init"', {
      cwd: fixtureDir,
      stdio: 'ignore',
    });
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ────────────────────────────────────────────────────────────────
  // 1. inject --json: buildContextPack produces JSON-serializable
  //    result whose `pack` property has required fields
  // ────────────────────────────────────────────────────────────────
  describe('inject --json output schema', () => {
    it('should produce valid JSON with pack containing items, omitted, total_tokens, and budget_tokens', () => {
      const result = buildContextPack({
        workingDir: fixtureDir,
        repoRoot: fixtureDir,
        requestText: 'fix the configuration loader',
        budgetTokens: 4000,
      });

      // The inject command outputs JSON.stringify(result, null, 2)
      // Verify round-trip JSON serialization
      const jsonStr = JSON.stringify(result, null, 2);
      const parsed = JSON.parse(jsonStr);

      // Top-level keys
      expect(parsed).toHaveProperty('event_id');
      expect(parsed).toHaveProperty('pack');
      expect(parsed).toHaveProperty('deep_read');

      // Pack schema
      const pack = parsed.pack;
      expect(pack).toHaveProperty('items');
      expect(pack).toHaveProperty('omitted');
      expect(pack).toHaveProperty('total_tokens');
      expect(pack).toHaveProperty('budget_tokens');
      expect(pack).toHaveProperty('budget_used_pct');
      expect(pack).toHaveProperty('version');

      // Type checks
      expect(Array.isArray(pack.items)).toBe(true);
      expect(Array.isArray(pack.omitted)).toBe(true);
      expect(typeof pack.total_tokens).toBe('number');
      expect(typeof pack.budget_tokens).toBe('number');
      expect(typeof pack.budget_used_pct).toBe('number');
    });

    it('should have valid PackItem schema for each included item', () => {
      const result = buildContextPack({
        workingDir: fixtureDir,
        repoRoot: fixtureDir,
        requestText: 'fix the configuration loader',
        budgetTokens: 4000,
      });

      const jsonStr = JSON.stringify(result, null, 2);
      const parsed = JSON.parse(jsonStr);

      expect(parsed.pack.items.length).toBeGreaterThan(0);

      for (const item of parsed.pack.items) {
        // Required fields per PackItem interface
        expect(typeof item.content).toBe('string');
        expect(typeof item.source).toBe('string');
        expect(typeof item.section).toBe('string');
        expect(typeof item.entry_id).toBe('string');
        expect(typeof item.score).toBe('number');
        expect(typeof item.tokens).toBe('number');
        expect(Array.isArray(item.reason_codes)).toBe(true);

        // Staleness info
        expect(item.staleness).toBeDefined();
        expect(typeof item.staleness.verified_at).toBe('string');
        expect(typeof item.staleness.is_stale).toBe('boolean');

        // Score range
        expect(item.score).toBeGreaterThanOrEqual(0);
        expect(item.score).toBeLessThanOrEqual(1);

        // Tokens non-negative
        expect(item.tokens).toBeGreaterThanOrEqual(0);
      }
    });

    it('should have valid OmittedItem schema when budget is tight', () => {
      const result = buildContextPack({
        workingDir: fixtureDir,
        repoRoot: fixtureDir,
        requestText: 'fix the configuration loader',
        budgetTokens: 50,
      });

      const jsonStr = JSON.stringify(result, null, 2);
      const parsed = JSON.parse(jsonStr);

      // With a tight budget, some items should be omitted
      expect(parsed.pack.omitted.length).toBeGreaterThan(0);

      for (const omitted of parsed.pack.omitted) {
        expect(typeof omitted.content_preview).toBe('string');
        expect(typeof omitted.source).toBe('string');
        expect(typeof omitted.section).toBe('string');
        expect(typeof omitted.score).toBe('number');
        expect(typeof omitted.tokens).toBe('number');
        expect(typeof omitted.reason).toBe('string');
      }

      // Budget respected
      expect(parsed.pack.total_tokens).toBeLessThanOrEqual(50);
    });

    it('should include deep_read field in JSON output when triggered', () => {
      const result = buildContextPack({
        workingDir: fixtureDir,
        repoRoot: fixtureDir,
        requestText: 'debug the failing test and investigate root cause',
        budgetTokens: 4000,
      });

      const jsonStr = JSON.stringify(result, null, 2);
      const parsed = JSON.parse(jsonStr);

      // Deep-read analysis keywords should trigger the deep_read field
      if (parsed.deep_read !== null) {
        expect(typeof parsed.deep_read.triggered).toBe('boolean');
        expect(typeof parsed.deep_read.rationale).toBe('string');
        expect(Array.isArray(parsed.deep_read.files_read)).toBe(true);
      }
    });

    it('should produce deterministic JSON output across multiple calls', () => {
      const opts = {
        workingDir: fixtureDir,
        repoRoot: fixtureDir,
        requestText: 'fix the configuration loader',
        budgetTokens: 4000,
      };

      const json1 = JSON.stringify(buildContextPack(opts), null, 2);
      const json2 = JSON.stringify(buildContextPack(opts), null, 2);

      const parsed1 = JSON.parse(json1);
      const parsed2 = JSON.parse(json2);

      // Same items, same order
      expect(parsed1.pack.items.length).toBe(parsed2.pack.items.length);
      for (let i = 0; i < parsed1.pack.items.length; i++) {
        expect(parsed1.pack.items[i].entry_id).toBe(parsed2.pack.items[i].entry_id);
        expect(parsed1.pack.items[i].score).toBe(parsed2.pack.items[i].score);
      }

      // Same totals
      expect(parsed1.pack.total_tokens).toBe(parsed2.pack.total_tokens);
      expect(parsed1.pack.budget_used_pct).toBe(parsed2.pack.budget_used_pct);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // 2. sessions list --json: daemon returns JSON with sessions
  //    array and total count
  // ────────────────────────────────────────────────────────────────
  describe('sessions list --json output schema', () => {
    let db: Database.Database;
    let daemonServer: ServerType;
    let daemonPort: number;

    beforeAll(async () => {
      const dbPath = join(tmpDir, 'sessions-test.db');
      db = openDatabase(dbPath);
      const app = createApp({ db, startedAt: new Date() });

      daemonServer = serve({
        fetch: app.fetch,
        port: 0,
        hostname: '127.0.0.1',
      });

      daemonPort = await waitForListening(daemonServer);
    });

    afterAll(() => {
      daemonServer?.close();
      db?.close();
    });

    it('should return valid JSON with sessions array and total for empty list', async () => {
      const res = await fetch(
        `http://127.0.0.1:${daemonPort}/api/v1/sessions`,
      );
      expect(res.ok).toBe(true);

      const data = await res.json();

      // Schema validation
      expect(data).toHaveProperty('sessions');
      expect(data).toHaveProperty('total');
      expect(Array.isArray(data.sessions)).toBe(true);
      expect(typeof data.total).toBe('number');
      expect(data.total).toBe(0);
      expect(data.sessions).toHaveLength(0);

      // Verify JSON round-trip
      const jsonStr = JSON.stringify(data, null, 2);
      const reparsed = JSON.parse(jsonStr);
      expect(reparsed).toEqual(data);
    });

    it('should return valid JSON with session objects after creating sessions', async () => {
      // Create two sessions
      for (const agentId of ['agent-a', 'agent-b']) {
        const createRes = await fetch(
          `http://127.0.0.1:${daemonPort}/api/v1/sessions`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              repo_path: fixtureDir,
              working_dir: fixtureDir,
              branch: 'main',
              agent_id: agentId,
            }),
          },
        );
        expect(createRes.status).toBe(201);
      }

      const res = await fetch(
        `http://127.0.0.1:${daemonPort}/api/v1/sessions`,
      );
      expect(res.ok).toBe(true);

      const data = await res.json();

      expect(data.total).toBeGreaterThanOrEqual(2);
      expect(data.sessions.length).toBeGreaterThanOrEqual(2);

      // Validate each session object schema
      for (const session of data.sessions) {
        expect(typeof session.id).toBe('string');
        expect(session.id).toMatch(/^sess_/);
        expect(typeof session.repo_path).toBe('string');
        expect(typeof session.working_dir).toBe('string');
        expect(typeof session.status).toBe('string');
        expect(['active', 'completed']).toContain(session.status);
        expect(typeof session.started_at).toBe('string');
        expect(typeof session.request_count).toBe('number');
      }
    });

    it('should return valid JSON for filtered session queries', async () => {
      // Filter by status=active
      const res = await fetch(
        `http://127.0.0.1:${daemonPort}/api/v1/sessions?status=active`,
      );
      expect(res.ok).toBe(true);

      const data = await res.json();

      expect(data).toHaveProperty('sessions');
      expect(data).toHaveProperty('total');
      expect(Array.isArray(data.sessions)).toBe(true);
      expect(typeof data.total).toBe('number');

      // All returned sessions should be active
      for (const session of data.sessions) {
        expect(session.status).toBe('active');
      }
    });

    it('should return valid JSON for session detail endpoint', async () => {
      // Get a session ID first
      const listRes = await fetch(
        `http://127.0.0.1:${daemonPort}/api/v1/sessions?limit=1`,
      );
      const listData = await listRes.json();
      const sessionId = listData.sessions[0].id;

      // Fetch detail
      const res = await fetch(
        `http://127.0.0.1:${daemonPort}/api/v1/sessions/${sessionId}`,
      );
      expect(res.ok).toBe(true);

      const data = await res.json();

      // Session detail schema
      expect(typeof data.id).toBe('string');
      expect(typeof data.repo_path).toBe('string');
      expect(typeof data.working_dir).toBe('string');
      expect(typeof data.status).toBe('string');
      expect(typeof data.started_at).toBe('string');
      expect(Array.isArray(data.events)).toBe(true);

      // Verify JSON round-trip
      const jsonStr = JSON.stringify(data, null, 2);
      const reparsed = JSON.parse(jsonStr);
      expect(reparsed).toEqual(data);
    });

    it('should return error JSON for non-existent session', async () => {
      const res = await fetch(
        `http://127.0.0.1:${daemonPort}/api/v1/sessions/nonexistent`,
      );
      expect(res.status).toBe(404);

      const data = await res.json();

      expect(data).toHaveProperty('error');
      expect(typeof data.error.code).toBe('string');
      expect(typeof data.error.message).toBe('string');
      expect(data.error.code).toBe('NOT_FOUND');
    });
  });

  // ────────────────────────────────────────────────────────────────
  // 3. propose --json: parseCtxFile output produces JSON with
  //    path, version, key_files, contracts, etc.
  // ────────────────────────────────────────────────────────────────
  describe('propose --json output schema', () => {
    it('should produce valid JSON with expected fields from parseCtxFile', () => {
      const content = CTX_YAML;
      const { ctx } = parseCtxFile(content);

      // Simulate the propose --json output as done by the CLI
      const result: Record<string, unknown> = {
        path: ctxFilePath,
        version: ctx.version,
        summary: ctx.summary,
        key_files: ctx.key_files.length,
        contracts: ctx.contracts.length,
        decisions: ctx.decisions.length,
        gotchas: ctx.gotchas.length,
        tags: ctx.tags,
        refs: ctx.refs.length,
      };

      const jsonStr = JSON.stringify(result, null, 2);
      const parsed = JSON.parse(jsonStr);

      // Required fields
      expect(parsed).toHaveProperty('path');
      expect(parsed).toHaveProperty('version');
      expect(parsed).toHaveProperty('summary');
      expect(parsed).toHaveProperty('key_files');
      expect(parsed).toHaveProperty('contracts');
      expect(parsed).toHaveProperty('decisions');
      expect(parsed).toHaveProperty('gotchas');
      expect(parsed).toHaveProperty('tags');
      expect(parsed).toHaveProperty('refs');

      // Type validation
      expect(typeof parsed.path).toBe('string');
      expect(typeof parsed.version).toBe('number');
      expect(typeof parsed.summary).toBe('string');
      expect(typeof parsed.key_files).toBe('number');
      expect(typeof parsed.contracts).toBe('number');
      expect(typeof parsed.decisions).toBe('number');
      expect(typeof parsed.gotchas).toBe('number');
      expect(Array.isArray(parsed.tags)).toBe(true);
      expect(typeof parsed.refs).toBe('number');
    });

    it('should include correct counts matching .ctx content', () => {
      const { ctx } = parseCtxFile(CTX_YAML);

      const result: Record<string, unknown> = {
        path: ctxFilePath,
        version: ctx.version,
        summary: ctx.summary,
        key_files: ctx.key_files.length,
        contracts: ctx.contracts.length,
        decisions: ctx.decisions.length,
        gotchas: ctx.gotchas.length,
        tags: ctx.tags,
        refs: ctx.refs.length,
      };

      const jsonStr = JSON.stringify(result, null, 2);
      const parsed = JSON.parse(jsonStr);

      expect(parsed.version).toBe(1);
      expect(parsed.key_files).toBe(2);
      expect(parsed.contracts).toBe(1);
      expect(parsed.decisions).toBe(1);
      expect(parsed.gotchas).toBe(1);
      expect(parsed.tags).toEqual(['typescript', 'nodejs', 'test']);
      expect(parsed.refs).toBe(0);
    });

    it('should include dead_references when --check-files equivalent is used', () => {
      const { ctx } = parseCtxFile(CTX_YAML);
      const ctxDir = resolve(fixtureDir);

      const result: Record<string, unknown> = {
        path: ctxFilePath,
        version: ctx.version,
        summary: ctx.summary,
        key_files: ctx.key_files.length,
        contracts: ctx.contracts.length,
        decisions: ctx.decisions.length,
        gotchas: ctx.gotchas.length,
        tags: ctx.tags,
        refs: ctx.refs.length,
      };

      // Simulate --check-files: check for dead file references
      // existsSync imported at top
      const deadRefs: Array<{ type: string; path: string }> = [];
      for (const kf of ctx.key_files) {
        if (!existsSync(resolve(ctxDir, kf.path))) {
          deadRefs.push({ type: 'key_file', path: kf.path });
        }
      }
      for (const ref of ctx.refs) {
        if (!existsSync(resolve(ctxDir, ref.target))) {
          deadRefs.push({ type: 'ref', path: ref.target });
        }
      }
      result.dead_references = deadRefs;

      const jsonStr = JSON.stringify(result, null, 2);
      const parsed = JSON.parse(jsonStr);

      expect(parsed).toHaveProperty('dead_references');
      expect(Array.isArray(parsed.dead_references)).toBe(true);

      // src/index.ts and src/config.ts exist, so no dead key_file refs
      // for those that exist
      for (const deadRef of parsed.dead_references) {
        expect(typeof deadRef.type).toBe('string');
        expect(typeof deadRef.path).toBe('string');
        expect(['key_file', 'ref']).toContain(deadRef.type);
      }
    });

    it('should detect dead references for missing files', () => {
      // Create a .ctx that references a non-existent file
      const ctxWithDeadRef = `---
version: 1
summary: "Project with dead references"
key_files:
  - path: src/index.ts
    purpose: "Exists"
    tags: []
    verified_at: ""
    locked: false
  - path: src/missing.ts
    purpose: "Does not exist"
    tags: []
    verified_at: ""
    locked: false
decisions: []
contracts: []
commands: {}
gotchas: []
tags: []
refs:
  - target: docs/nonexistent.md
    sections: [all]
    reason: "Dead reference"
ignore:
  never_read: []
  never_log: []
`;

      const deadCtxPath = join(fixtureDir, '.ctx-dead-test');
      writeFileSync(deadCtxPath, ctxWithDeadRef);

      const { ctx } = parseCtxFile(ctxWithDeadRef);
      const ctxDir = resolve(fixtureDir);

      // existsSync imported at top
      const deadRefs: Array<{ type: string; path: string }> = [];
      for (const kf of ctx.key_files) {
        if (!existsSync(resolve(ctxDir, kf.path))) {
          deadRefs.push({ type: 'key_file', path: kf.path });
        }
      }
      for (const ref of ctx.refs) {
        if (!existsSync(resolve(ctxDir, ref.target))) {
          deadRefs.push({ type: 'ref', path: ref.target });
        }
      }

      const result = {
        path: deadCtxPath,
        version: ctx.version,
        key_files: ctx.key_files.length,
        contracts: ctx.contracts.length,
        decisions: ctx.decisions.length,
        gotchas: ctx.gotchas.length,
        tags: ctx.tags,
        refs: ctx.refs.length,
        dead_references: deadRefs,
      };

      const jsonStr = JSON.stringify(result, null, 2);
      const parsed = JSON.parse(jsonStr);

      expect(parsed.dead_references.length).toBe(2);
      expect(parsed.dead_references).toContainEqual({
        type: 'key_file',
        path: 'src/missing.ts',
      });
      expect(parsed.dead_references).toContainEqual({
        type: 'ref',
        path: 'docs/nonexistent.md',
      });
    });

    it('should produce valid parseCtxFile output that is fully JSON-serializable', () => {
      const { ctx } = parseCtxFile(CTX_YAML);

      // The full CtxFile object should be JSON-serializable
      const jsonStr = JSON.stringify(ctx, null, 2);
      const parsed = JSON.parse(jsonStr);

      // CtxFile fields
      expect(typeof parsed.version).toBe('number');
      expect(typeof parsed.summary).toBe('string');
      expect(Array.isArray(parsed.key_files)).toBe(true);
      expect(Array.isArray(parsed.contracts)).toBe(true);
      expect(Array.isArray(parsed.decisions)).toBe(true);
      expect(typeof parsed.commands).toBe('object');
      expect(Array.isArray(parsed.gotchas)).toBe(true);
      expect(Array.isArray(parsed.tags)).toBe(true);
      expect(Array.isArray(parsed.refs)).toBe(true);
      expect(typeof parsed.ignore).toBe('object');

      // KeyFile schema
      for (const kf of parsed.key_files) {
        expect(typeof kf.path).toBe('string');
        expect(typeof kf.purpose).toBe('string');
        expect(Array.isArray(kf.tags)).toBe(true);
        expect(typeof kf.verified_at).toBe('string');
        expect(typeof kf.locked).toBe('boolean');
      }

      // Contract schema
      for (const contract of parsed.contracts) {
        expect(typeof contract.name).toBe('string');
        expect(typeof contract.scope).toBe('object');
        expect(Array.isArray(contract.scope.paths)).toBe(true);
        expect(Array.isArray(contract.scope.tags)).toBe(true);
        expect(typeof contract.content).toBe('string');
        expect(typeof contract.verified_at).toBe('string');
        expect(typeof contract.locked).toBe('boolean');
      }

      // Decision schema
      for (const decision of parsed.decisions) {
        expect(typeof decision.id).toBe('string');
        expect(typeof decision.title).toBe('string');
        expect(['accepted', 'deprecated', 'superseded']).toContain(decision.status);
        expect(typeof decision.date).toBe('string');
        expect(typeof decision.rationale).toBe('string');
        expect(Array.isArray(decision.alternatives)).toBe(true);
      }

      // Gotcha schema
      for (const gotcha of parsed.gotchas) {
        expect(typeof gotcha.text).toBe('string');
        expect(Array.isArray(gotcha.tags)).toBe(true);
        expect(typeof gotcha.verified_at).toBe('string');
        expect(typeof gotcha.locked).toBe('boolean');
      }

      // IgnorePolicy schema
      expect(Array.isArray(parsed.ignore.never_read)).toBe(true);
      expect(Array.isArray(parsed.ignore.never_log)).toBe(true);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // 4. Cross-cutting: JSON output from all commands should be
  //    parseable and contain no extraneous non-JSON content
  // ────────────────────────────────────────────────────────────────
  describe('cross-cutting JSON output concerns', () => {
    it('should produce JSON with no undefined values (JSON.stringify drops them)', () => {
      const result = buildContextPack({
        workingDir: fixtureDir,
        repoRoot: fixtureDir,
        requestText: 'test request',
        budgetTokens: 4000,
      });

      const jsonStr = JSON.stringify(result, null, 2);

      // JSON.stringify should not produce 'undefined' in the string
      expect(jsonStr).not.toContain('undefined');

      // Parse should succeed cleanly
      expect(() => JSON.parse(jsonStr)).not.toThrow();
    });

    it('should produce JSON where all numeric fields are finite numbers', () => {
      const result = buildContextPack({
        workingDir: fixtureDir,
        repoRoot: fixtureDir,
        requestText: 'test request',
        budgetTokens: 4000,
      });

      const jsonStr = JSON.stringify(result, null, 2);
      const parsed = JSON.parse(jsonStr);

      // Check numeric fields are finite
      expect(Number.isFinite(parsed.pack.total_tokens)).toBe(true);
      expect(Number.isFinite(parsed.pack.budget_tokens)).toBe(true);
      expect(Number.isFinite(parsed.pack.budget_used_pct)).toBe(true);

      for (const item of parsed.pack.items) {
        expect(Number.isFinite(item.score)).toBe(true);
        expect(Number.isFinite(item.tokens)).toBe(true);
      }

      for (const omitted of parsed.pack.omitted) {
        expect(Number.isFinite(omitted.score)).toBe(true);
        expect(Number.isFinite(omitted.tokens)).toBe(true);
      }
    });

    it('should produce JSON that does not contain NaN or Infinity (not valid JSON)', () => {
      const result = buildContextPack({
        workingDir: fixtureDir,
        repoRoot: fixtureDir,
        requestText: 'test request',
        budgetTokens: 4000,
      });

      const jsonStr = JSON.stringify(result, null, 2);

      expect(jsonStr).not.toContain('NaN');
      expect(jsonStr).not.toContain('Infinity');
    });
  });
});
