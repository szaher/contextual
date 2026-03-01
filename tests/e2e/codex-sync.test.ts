import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { syncAgents } from '../../packages/cli/src/services/agents-md.js';

const CTXKIT_BEGIN = '<!-- CTXKIT:BEGIN - Managed by CtxKit. Do not edit this section. -->';
const CTXKIT_END = '<!-- CTXKIT:END -->';

const ROOT_CTX = `---
summary: "Project description here"
key_files:
  - path: src/index.ts
    purpose: "Main entry point"
    tags: [entry]
    verified_at: ""
    locked: false
decisions:
  - id: lang-choice
    title: "Use TypeScript"
    status: accepted
    date: "2026-01-15"
    rationale: "Type safety"
    alternatives: []
    verified_at: ""
    locked: false
gotchas:
  - text: "Config file must exist"
    tags: [config]
    verified_at: ""
    locked: false
contracts: []
commands: {}
tags: [typescript]
refs: []
ignore:
  never_read: []
  never_log: []
`;

const SRC_CTX = `---
summary: "Source module with API handlers"
key_files:
  - path: src/handler.ts
    purpose: "HTTP request handler"
    tags: [api]
    verified_at: ""
    locked: false
decisions:
  - id: framework-choice
    title: "Use Hono for HTTP"
    status: accepted
    date: "2026-02-01"
    rationale: "Lightweight and fast"
    alternatives: []
    verified_at: ""
    locked: false
gotchas:
  - text: "Routes must be registered before listen()"
    tags: [routing]
    verified_at: ""
    locked: false
contracts: []
commands: {}
tags: [api]
refs: []
ignore:
  never_read: []
  never_log: []
`;

describe('E2E: T047 - ctxkit codex sync-agents', () => {
  const tmpDirs: string[] = [];

  function createTmpRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), 'ctxl-codex-sync-'));
    tmpDirs.push(dir);
    execSync('git init', { cwd: dir, stdio: 'ignore' });
    execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'ignore' });
    execSync('git config user.name "Test"', { cwd: dir, stdio: 'ignore' });
    return dir;
  }

  afterAll(() => {
    for (const dir of tmpDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should create AGENTS.md files in directories containing .ctx files', () => {
    const repoRoot = createTmpRepo();

    // Create root .ctx
    writeFileSync(join(repoRoot, '.ctx'), ROOT_CTX);

    // Create src/ directory with its own .ctx
    mkdirSync(join(repoRoot, 'src'), { recursive: true });
    writeFileSync(join(repoRoot, 'src', '.ctx'), SRC_CTX);

    // Commit so git repo is valid
    execSync('git add -A && git commit -m "initial"', { cwd: repoRoot, stdio: 'ignore' });

    // Run syncAgents
    const results = syncAgents({ repoRoot, budget: 8000, dryRun: false });

    // Should have results for both root and src/
    expect(results.length).toBe(2);

    // Root AGENTS.md created
    const rootResult = results.find((r) => r.dir === '.');
    expect(rootResult).toBeDefined();
    expect(rootResult!.action).toBe('created');

    // src/ AGENTS.md created
    const srcResult = results.find((r) => r.dir === 'src');
    expect(srcResult).toBeDefined();
    expect(srcResult!.action).toBe('created');

    // Files actually exist on disk
    expect(existsSync(join(repoRoot, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(repoRoot, 'src', 'AGENTS.md'))).toBe(true);
  });

  it('should contain expected sections (Key Files, Decisions, Gotchas)', () => {
    const repoRoot = createTmpRepo();

    writeFileSync(join(repoRoot, '.ctx'), ROOT_CTX);
    execSync('git add -A && git commit -m "initial"', { cwd: repoRoot, stdio: 'ignore' });

    syncAgents({ repoRoot, budget: 8000, dryRun: false });

    const content = readFileSync(join(repoRoot, 'AGENTS.md'), 'utf-8');

    // Key Files section present with the entry from .ctx
    expect(content).toContain('### Key Files');
    expect(content).toContain('`src/index.ts`');
    expect(content).toContain('Main entry point');

    // Decisions section present
    expect(content).toContain('### Decisions');
    expect(content).toContain('Use TypeScript');
    expect(content).toContain('2026-01-15');

    // Gotchas section present
    expect(content).toContain('### Gotchas');
    expect(content).toContain('Config file must exist');
  });

  it('should wrap managed content in CTXKIT marker protocol', () => {
    const repoRoot = createTmpRepo();

    writeFileSync(join(repoRoot, '.ctx'), ROOT_CTX);
    execSync('git add -A && git commit -m "initial"', { cwd: repoRoot, stdio: 'ignore' });

    syncAgents({ repoRoot, budget: 8000, dryRun: false });

    const content = readFileSync(join(repoRoot, 'AGENTS.md'), 'utf-8');

    // Verify begin marker
    expect(content).toContain(CTXKIT_BEGIN);

    // Verify end marker
    expect(content).toContain(CTXKIT_END);

    // Begin marker comes before end marker
    const beginIdx = content.indexOf(CTXKIT_BEGIN);
    const endIdx = content.indexOf(CTXKIT_END);
    expect(beginIdx).toBeLessThan(endIdx);

    // There is content between the markers
    const managedContent = content.slice(beginIdx + CTXKIT_BEGIN.length, endIdx).trim();
    expect(managedContent.length).toBeGreaterThan(0);
    expect(managedContent).toContain('## CtxKit Project Context');
  });

  it('should be idempotent: re-running produces zero-diff (all unchanged)', () => {
    const repoRoot = createTmpRepo();

    writeFileSync(join(repoRoot, '.ctx'), ROOT_CTX);
    mkdirSync(join(repoRoot, 'src'), { recursive: true });
    writeFileSync(join(repoRoot, 'src', '.ctx'), SRC_CTX);
    execSync('git add -A && git commit -m "initial"', { cwd: repoRoot, stdio: 'ignore' });

    // First sync
    const firstResults = syncAgents({ repoRoot, budget: 8000, dryRun: false });
    expect(firstResults.every((r) => r.action === 'created')).toBe(true);

    // Capture file contents after first sync
    const rootContentAfterFirst = readFileSync(join(repoRoot, 'AGENTS.md'), 'utf-8');
    const srcContentAfterFirst = readFileSync(join(repoRoot, 'src', 'AGENTS.md'), 'utf-8');

    // Second sync (should be idempotent)
    const secondResults = syncAgents({ repoRoot, budget: 8000, dryRun: false });

    // All results should be 'unchanged'
    expect(secondResults.length).toBe(2);
    for (const result of secondResults) {
      expect(result.action).toBe('unchanged');
    }

    // File contents should be identical
    const rootContentAfterSecond = readFileSync(join(repoRoot, 'AGENTS.md'), 'utf-8');
    const srcContentAfterSecond = readFileSync(join(repoRoot, 'src', 'AGENTS.md'), 'utf-8');
    expect(rootContentAfterSecond).toBe(rootContentAfterFirst);
    expect(srcContentAfterSecond).toBe(srcContentAfterFirst);
  });

  it('should preserve user content outside markers on re-sync', () => {
    const repoRoot = createTmpRepo();

    writeFileSync(join(repoRoot, '.ctx'), ROOT_CTX);
    execSync('git add -A && git commit -m "initial"', { cwd: repoRoot, stdio: 'ignore' });

    // First sync to create AGENTS.md
    syncAgents({ repoRoot, budget: 8000, dryRun: false });

    // Add user content before and after the managed section
    const original = readFileSync(join(repoRoot, 'AGENTS.md'), 'utf-8');
    const userContentBefore = '# My Custom Instructions\n\nAlways use strict mode.\n\n';
    const userContentAfter = '\n\n## My Testing Rules\n\nRun tests before committing.\n';
    const modified = userContentBefore + original + userContentAfter;
    writeFileSync(join(repoRoot, 'AGENTS.md'), modified);

    // Re-sync
    const results = syncAgents({ repoRoot, budget: 8000, dryRun: false });

    // Should detect as unchanged since managed section is identical
    const rootResult = results.find((r) => r.dir === '.');
    expect(rootResult).toBeDefined();
    expect(rootResult!.action).toBe('unchanged');

    // User content should still be present
    const afterSync = readFileSync(join(repoRoot, 'AGENTS.md'), 'utf-8');
    expect(afterSync).toContain('# My Custom Instructions');
    expect(afterSync).toContain('Always use strict mode.');
    expect(afterSync).toContain('## My Testing Rules');
    expect(afterSync).toContain('Run tests before committing.');

    // Managed markers still present
    expect(afterSync).toContain(CTXKIT_BEGIN);
    expect(afterSync).toContain(CTXKIT_END);
  });

  it('should update managed section but keep user content when .ctx changes', () => {
    const repoRoot = createTmpRepo();

    writeFileSync(join(repoRoot, '.ctx'), ROOT_CTX);
    execSync('git add -A && git commit -m "initial"', { cwd: repoRoot, stdio: 'ignore' });

    // First sync
    syncAgents({ repoRoot, budget: 8000, dryRun: false });

    // Add user content outside markers
    const original = readFileSync(join(repoRoot, 'AGENTS.md'), 'utf-8');
    const userContentBefore = '# My Custom Instructions\n\nAlways use strict mode.\n\n';
    const userContentAfter = '\n\n## My Testing Rules\n\nRun tests before committing.\n';
    const modified = userContentBefore + original + userContentAfter;
    writeFileSync(join(repoRoot, 'AGENTS.md'), modified);

    // Modify the .ctx file: change summary and add a new gotcha
    const updatedCtx = `---
summary: "Updated project description with new features"
key_files:
  - path: src/index.ts
    purpose: "Main entry point"
    tags: [entry]
    verified_at: ""
    locked: false
  - path: src/config.ts
    purpose: "Configuration loader"
    tags: [config]
    verified_at: ""
    locked: false
decisions:
  - id: lang-choice
    title: "Use TypeScript"
    status: accepted
    date: "2026-01-15"
    rationale: "Type safety"
    alternatives: []
    verified_at: ""
    locked: false
gotchas:
  - text: "Config file must exist"
    tags: [config]
    verified_at: ""
    locked: false
  - text: "Environment variables override config file"
    tags: [config, env]
    verified_at: ""
    locked: false
contracts: []
commands: {}
tags: [typescript]
refs: []
ignore:
  never_read: []
  never_log: []
`;
    writeFileSync(join(repoRoot, '.ctx'), updatedCtx);
    execSync('git add -A && git commit -m "update ctx"', { cwd: repoRoot, stdio: 'ignore' });

    // Re-sync
    const results = syncAgents({ repoRoot, budget: 8000, dryRun: false });

    const rootResult = results.find((r) => r.dir === '.');
    expect(rootResult).toBeDefined();
    expect(rootResult!.action).toBe('updated');

    // Read the final file
    const afterSync = readFileSync(join(repoRoot, 'AGENTS.md'), 'utf-8');

    // User content is preserved
    expect(afterSync).toContain('# My Custom Instructions');
    expect(afterSync).toContain('Always use strict mode.');
    expect(afterSync).toContain('## My Testing Rules');
    expect(afterSync).toContain('Run tests before committing.');

    // Managed section is updated with new content
    expect(afterSync).toContain('Updated project description with new features');
    expect(afterSync).toContain('`src/config.ts`');
    expect(afterSync).toContain('Configuration loader');
    expect(afterSync).toContain('Environment variables override config file');

    // Markers still intact
    expect(afterSync).toContain(CTXKIT_BEGIN);
    expect(afterSync).toContain(CTXKIT_END);

    // User content before is before the begin marker
    const beginIdx = afterSync.indexOf(CTXKIT_BEGIN);
    const customIdx = afterSync.indexOf('# My Custom Instructions');
    expect(customIdx).toBeLessThan(beginIdx);

    // User content after is after the end marker
    const endIdx = afterSync.indexOf(CTXKIT_END);
    const testingIdx = afterSync.indexOf('## My Testing Rules');
    expect(testingIdx).toBeGreaterThan(endIdx);
  });

  it('should include CtxKit Usage Policy section in generated output', () => {
    const repoRoot = createTmpRepo();

    writeFileSync(join(repoRoot, '.ctx'), ROOT_CTX);
    execSync('git add -A && git commit -m "initial"', { cwd: repoRoot, stdio: 'ignore' });

    syncAgents({ repoRoot, budget: 8000, dryRun: false });

    const content = readFileSync(join(repoRoot, 'AGENTS.md'), 'utf-8');

    expect(content).toContain('## CtxKit Usage Policy');
    expect(content).toContain('### Preferred: MCP Tools');
    expect(content).toContain('### Fallback: CLI Commands');
    expect(content).toContain('### Best Practices');
    expect(content).toContain('ctxkit.context_pack');
  });

  it('should report token counts for each generated file', () => {
    const repoRoot = createTmpRepo();

    writeFileSync(join(repoRoot, '.ctx'), ROOT_CTX);
    mkdirSync(join(repoRoot, 'src'), { recursive: true });
    writeFileSync(join(repoRoot, 'src', '.ctx'), SRC_CTX);
    execSync('git add -A && git commit -m "initial"', { cwd: repoRoot, stdio: 'ignore' });

    const results = syncAgents({ repoRoot, budget: 8000, dryRun: false });

    for (const result of results) {
      expect(result.tokens).toBeGreaterThan(0);
      expect(result.tokens).toBeLessThanOrEqual(8000);
      expect(result.relativePath).toBeTruthy();
      expect(result.dir).toBeTruthy();
    }
  });

  it('should support dry-run mode without writing files', () => {
    const repoRoot = createTmpRepo();

    writeFileSync(join(repoRoot, '.ctx'), ROOT_CTX);
    execSync('git add -A && git commit -m "initial"', { cwd: repoRoot, stdio: 'ignore' });

    const results = syncAgents({ repoRoot, budget: 8000, dryRun: true });

    // Should still return results
    expect(results.length).toBe(1);
    expect(results[0].action).toBe('created');

    // But AGENTS.md should NOT exist on disk
    expect(existsSync(join(repoRoot, 'AGENTS.md'))).toBe(false);
  });
});
