import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { parseCtxFile, serializeCtxFile } from '@ctxkit/core';
import type { CtxFile } from '@ctxkit/core';
import {
  parseConstitution,
  parseComponentSpec,
  importConstitution,
  importSpecs,
} from '../../packages/speckit-bridge/src/importer.js';
import { exportToSpecKit } from '../../packages/speckit-bridge/src/exporter.js';
import { validateConstitution } from '../../packages/speckit-bridge/src/validator.js';
import { syncBidirectional, loadSyncState, saveSyncState } from '../../packages/speckit-bridge/src/sync.js';

/**
 * T093 -- Integration tests: spec-kit bridge
 *
 * Tests:
 *   1. Constitution import creates locked decisions and contracts
 *   2. Component spec import creates contracts and gotchas
 *   3. Export round-trip fidelity
 *   4. Validation detects violations
 *   5. Bidirectional sync with timestamp comparison
 *   6. Conflict detection when both modified
 */

const CONSTITUTION_MD = `# Project Constitution

## I. Local-First, Private-by-Default

All data MUST remain on the local filesystem. No network calls unless user explicitly opts in.

- Storage MUST use local SQLite or filesystem
- No telemetry or analytics without consent

## II. Repository Truth Over Guessing

Code analysis MUST be based on actual repository contents, not heuristics or assumptions.

- All context MUST come from real .ctx files
- Never invent or hallucinate file references

## III. Transparent Context

Context injection SHOULD be inspectable and deterministic.

- Include source paths and reason codes
- Budget usage must be visible
`;

const COMPONENT_SPEC_MD = `# Auth Component Spec

## Functional Requirements

- Users MUST be able to log in with email and password
- Sessions MUST expire after 24 hours of inactivity
- Failed login attempts MUST be rate-limited to 5 per minute

## Edge Cases

- User attempts login with expired account
- Concurrent login from multiple devices
- Password reset during active session
`;

describe('Integration: Spec-Kit Bridge (T093)', () => {
  let tmpDir: string;
  let repoDir: string;

  beforeAll(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxl-speckit-bridge-'));
    repoDir = join(tmpDir, 'repo');
    mkdirSync(repoDir, { recursive: true });
    mkdirSync(join(repoDir, 'src'), { recursive: true });
    mkdirSync(join(repoDir, '.specify', 'memory'), { recursive: true });
    mkdirSync(join(repoDir, 'specs'), { recursive: true });

    writeFileSync(join(repoDir, 'src', 'index.ts'), 'export const main = () => {};\n');

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
  // 1. Constitution import
  // ────────────────────────────────────────────────────────────────
  describe('parseConstitution', () => {
    it('should extract principles as decisions', () => {
      const { decisions } = parseConstitution(CONSTITUTION_MD);

      expect(decisions.length).toBe(3);
      expect(decisions[0].id).toBe('CONST-I');
      expect(decisions[0].title).toBe('Local-First, Private-by-Default');
      expect(decisions[0].locked).toBe(true);
      expect(decisions[0].status).toBe('accepted');
      expect(decisions[0].owner).toBe('speckit-bridge');
    });

    it('should extract MUST clauses as locked contracts', () => {
      const { contracts } = parseConstitution(CONSTITUTION_MD);

      // Principles I and II have MUST clauses → should generate contracts
      expect(contracts.length).toBeGreaterThanOrEqual(2);
      expect(contracts[0].name).toContain('CONST-');
      expect(contracts[0].locked).toBe(true);
    });
  });

  describe('importConstitution', () => {
    it('should create root .ctx with locked decisions', () => {
      const constPath = join(repoDir, '.specify', 'memory', 'constitution.md');
      writeFileSync(constPath, CONSTITUTION_MD);

      const result = importConstitution(repoDir, '.specify/memory/constitution.md');

      expect(result.decisions).toBe(3);
      expect(result.contracts).toBeGreaterThanOrEqual(2);
      expect(result.files_updated).toContain('.ctx');

      // Verify root .ctx
      const rootCtx = readFileSync(join(repoDir, '.ctx'), 'utf-8');
      const { ctx } = parseCtxFile(rootCtx);

      const constDecisions = ctx.decisions.filter((d) => d.id.startsWith('CONST-'));
      expect(constDecisions.length).toBe(3);
      expect(constDecisions.every((d) => d.locked)).toBe(true);

      // Should have bumped version
      expect(ctx.version).toBeGreaterThanOrEqual(2);
      expect(ctx._history).toBeDefined();
      expect(ctx._history!.length).toBeGreaterThan(0);
    });

    it('should be idempotent — second import replaces CONST- decisions', () => {
      importConstitution(repoDir, '.specify/memory/constitution.md');

      const rootCtx = readFileSync(join(repoDir, '.ctx'), 'utf-8');
      const { ctx } = parseCtxFile(rootCtx);

      // Should still have exactly 3 CONST- decisions, not 6
      const constDecisions = ctx.decisions.filter((d) => d.id.startsWith('CONST-'));
      expect(constDecisions.length).toBe(3);
    });

    it('should support dry-run mode', () => {
      const result = importConstitution(repoDir, '.specify/memory/constitution.md', true);

      expect(result.decisions).toBe(3);
      expect(result.files_updated).toHaveLength(0);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // 2. Component spec import
  // ────────────────────────────────────────────────────────────────
  describe('parseComponentSpec', () => {
    it('should extract requirements as contracts', () => {
      const { contracts } = parseComponentSpec(COMPONENT_SPEC_MD, 'auth');

      expect(contracts.length).toBe(3);
      expect(contracts[0].name).toMatch(/^FR-auth-/);
      expect(contracts[0].content).toContain('log in');
    });

    it('should extract edge cases as gotchas', () => {
      const { gotchas } = parseComponentSpec(COMPONENT_SPEC_MD, 'auth');

      expect(gotchas.length).toBe(3);
      expect(gotchas[0].text).toContain('expired account');
      expect(gotchas[0].tags).toContain('auth');
    });
  });

  describe('importSpecs', () => {
    it('should import component specs into .ctx files', () => {
      writeFileSync(join(repoDir, 'specs', 'auth.md'), COMPONENT_SPEC_MD);

      const result = importSpecs(repoDir, 'specs/');

      expect(result.contracts).toBe(3);
      expect(result.gotchas).toBe(3);
      expect(result.files_updated.length).toBeGreaterThan(0);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // 3. Export round-trip
  // ────────────────────────────────────────────────────────────────
  describe('exportToSpecKit', () => {
    it('should export .ctx content to markdown', () => {
      const outputDir = join(repoDir, 'specs', 'exported');

      const result = exportToSpecKit(repoDir, outputDir, 'md');

      expect(result.exported_files.length).toBeGreaterThan(0);

      // Read exported file
      const exportedPath = join(repoDir, result.exported_files[0]);
      const content = readFileSync(exportedPath, 'utf-8');

      expect(content).toContain('Decisions');
      expect(content).toContain('CONST-');
      expect(content).toContain('Contracts');
    });

    it('should preserve manual sections in existing exported files', () => {
      const outputDir = join(repoDir, 'specs', 'exported');
      const rootFile = join(outputDir, 'root.md');

      // Add manual section to existing export
      let content = readFileSync(rootFile, 'utf-8');
      content += '\n<!-- MANUAL START -->\nCustom notes here.\n<!-- MANUAL END -->\n';
      writeFileSync(rootFile, content);

      // Re-export
      exportToSpecKit(repoDir, outputDir, 'md');

      const reExported = readFileSync(rootFile, 'utf-8');
      expect(reExported).toContain('Custom notes here.');
      expect(reExported).toContain('<!-- MANUAL START -->');
    });

    it('should export to YAML format', () => {
      const outputDir = join(repoDir, 'specs', 'yaml-export');

      const result = exportToSpecKit(repoDir, outputDir, 'yaml');

      expect(result.exported_files.length).toBeGreaterThan(0);

      const exportedPath = join(repoDir, result.exported_files[0]);
      const content = readFileSync(exportedPath, 'utf-8');
      expect(content).toContain('decisions:');
      expect(content).toContain('CONST-');
    });
  });

  // ────────────────────────────────────────────────────────────────
  // 4. Constitution validation
  // ────────────────────────────────────────────────────────────────
  describe('validateConstitution', () => {
    it('should pass when .ctx files comply', () => {
      const result = validateConstitution(repoDir, '.specify/memory/constitution.md');

      // Should have no error-level violations (warnings may exist)
      const errors = result.violations.filter((v) => v.severity === 'error');
      expect(errors.length).toBe(0);
    });

    it('should detect unlocked CONST- decisions as violations', () => {
      // Create a .ctx with an unlocked CONST- decision
      const badCtxDir = join(repoDir, 'bad');
      mkdirSync(badCtxDir, { recursive: true });
      const badCtx: CtxFile = {
        version: 1,
        summary: 'Bad context',
        key_files: [],
        contracts: [],
        decisions: [
          {
            id: 'CONST-I',
            title: 'Local-First',
            status: 'accepted',
            date: '2026-01-01',
            rationale: 'Test',
            alternatives: [],
            verified_at: '',
            locked: false, // Should be locked!
            owner: null,
          },
        ],
        commands: {},
        gotchas: [],
        tags: [],
        refs: [],
        ignore: { never_read: [], never_log: [] },
        _history: [],
      };
      writeFileSync(join(badCtxDir, '.ctx'), serializeCtxFile(badCtx));

      const result = validateConstitution(repoDir, '.specify/memory/constitution.md');

      const errors = result.violations.filter((v) => v.severity === 'error');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].violation).toContain('not locked');
    });

    it('should detect external service references violating local-first', () => {
      const extCtxDir = join(repoDir, 'external');
      mkdirSync(extCtxDir, { recursive: true });
      const extCtx: CtxFile = {
        version: 1,
        summary: 'External service',
        key_files: [],
        contracts: [
          {
            name: 'cloud-api',
            scope: { paths: ['src/'], tags: [] },
            content: 'Uses external cloud SaaS API for authentication',
            verified_at: '',
            locked: false,
            owner: null,
          },
        ],
        decisions: [],
        commands: {},
        gotchas: [],
        tags: [],
        refs: [],
        ignore: { never_read: [], never_log: [] },
        _history: [],
      };
      writeFileSync(join(extCtxDir, '.ctx'), serializeCtxFile(extCtx));

      const result = validateConstitution(repoDir, '.specify/memory/constitution.md');

      const warnings = result.violations.filter(
        (v) => v.severity === 'warning' && v.violation.includes('external'),
      );
      expect(warnings.length).toBeGreaterThan(0);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // 5. Bidirectional sync
  // ────────────────────────────────────────────────────────────────
  describe('syncBidirectional', () => {
    let syncDir: string;

    beforeEach(() => {
      syncDir = join(tmpDir, `sync-${Date.now()}`);
      mkdirSync(syncDir, { recursive: true });
      mkdirSync(join(syncDir, '.specify', 'memory'), { recursive: true });
      mkdirSync(join(syncDir, 'specs'), { recursive: true });
      mkdirSync(join(syncDir, 'src'), { recursive: true });

      writeFileSync(join(syncDir, 'src', 'app.ts'), 'export {};\n');

      execSync('git init', { cwd: syncDir, stdio: 'ignore' });
      execSync('git add .', { cwd: syncDir, stdio: 'ignore' });
      execSync('git -c user.name="test" -c user.email="t@t.co" commit -m "init"', {
        cwd: syncDir,
        stdio: 'ignore',
      });
    });

    it('should import when spec is newer', () => {
      const constPath = join(syncDir, '.specify', 'memory', 'constitution.md');
      writeFileSync(constPath, CONSTITUTION_MD);

      const result = syncBidirectional(syncDir, {
        constitutionPath: '.specify/memory/constitution.md',
      });

      expect(result.synced).toBeGreaterThan(0);
      expect(existsSync(join(syncDir, '.ctx'))).toBe(true);
    });

    it('should save and load sync state', () => {
      const states = [
        {
          spec_path: 'constitution.md',
          ctx_path: '.ctx',
          spec_mtime: '2026-01-01T00:00:00Z',
          ctx_mtime: '2026-01-01T00:00:00Z',
          last_synced: '2026-01-01T00:00:00Z',
          direction: 'bidirectional' as const,
        },
      ];

      saveSyncState(syncDir, states);
      const loaded = loadSyncState(syncDir);

      expect(loaded.length).toBe(1);
      expect(loaded[0].spec_path).toBe('constitution.md');
    });

    it('should force sync direction when specified', () => {
      const constPath = join(syncDir, '.specify', 'memory', 'constitution.md');
      writeFileSync(constPath, CONSTITUTION_MD);

      // Create a .ctx file first
      const ctx: CtxFile = {
        version: 1,
        summary: 'Test',
        key_files: [],
        contracts: [],
        decisions: [
          {
            id: 'local-1',
            title: 'Local Decision',
            status: 'accepted',
            date: '2026-01-01',
            rationale: 'test',
            alternatives: [],
            verified_at: '',
            locked: false,
            owner: null,
          },
        ],
        commands: {},
        gotchas: [],
        tags: [],
        refs: [],
        ignore: { never_read: [], never_log: [] },
        _history: [],
      };
      writeFileSync(join(syncDir, '.ctx'), serializeCtxFile(ctx));

      const result = syncBidirectional(syncDir, {
        forceDirection: 'spec-to-ctx',
        constitutionPath: '.specify/memory/constitution.md',
      });

      expect(result.synced).toBeGreaterThan(0);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // 6. Conflict detection
  // ────────────────────────────────────────────────────────────────
  describe('conflict detection', () => {
    it('should detect conflicts when both spec and ctx modified since last sync', () => {
      const conflictDir = join(tmpDir, `conflict-${Date.now()}`);
      mkdirSync(conflictDir, { recursive: true });
      mkdirSync(join(conflictDir, '.specify', 'memory'), { recursive: true });

      // Create a dummy file so git has something to commit
      writeFileSync(join(conflictDir, '.gitkeep'), '', 'utf-8');
      execSync('git init', { cwd: conflictDir, stdio: 'ignore' });
      execSync('git add .', { cwd: conflictDir, stdio: 'ignore' });
      execSync('git -c user.name="test" -c user.email="t@t.co" commit -m "init"', {
        cwd: conflictDir,
        stdio: 'ignore',
      });

      // Set up initial sync state with old timestamp
      const oldTime = '2020-01-01T00:00:00Z';
      saveSyncState(conflictDir, [
        {
          spec_path: '.specify/memory/constitution.md',
          ctx_path: '.ctx',
          spec_mtime: oldTime,
          ctx_mtime: oldTime,
          last_synced: oldTime,
          direction: 'bidirectional',
        },
      ]);

      // Write both files (both newer than last sync)
      writeFileSync(
        join(conflictDir, '.specify', 'memory', 'constitution.md'),
        CONSTITUTION_MD,
      );
      const ctx: CtxFile = {
        version: 1,
        summary: 'Modified ctx',
        key_files: [],
        contracts: [],
        decisions: [],
        commands: {},
        gotchas: [],
        tags: [],
        refs: [],
        ignore: { never_read: [], never_log: [] },
        _history: [],
      };
      writeFileSync(join(conflictDir, '.ctx'), serializeCtxFile(ctx));

      const result = syncBidirectional(conflictDir, {
        constitutionPath: '.specify/memory/constitution.md',
      });

      expect(result.conflicts).toBeGreaterThan(0);
    });
  });
});
