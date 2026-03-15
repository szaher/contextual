import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateIndex, writeIndex, readIndex, selectFromIndex, updateIndexEntry, computeChecksum, isValidChecksum, parseCtxFile } from '@ctxkit/core';

describe('Index Generation and Selection (US1)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxl-index-'));

    // Create a multi-.ctx repository structure
    mkdirSync(join(tmpDir, 'src', 'auth'), { recursive: true });
    mkdirSync(join(tmpDir, 'src', 'api'), { recursive: true });
    mkdirSync(join(tmpDir, 'src', 'utils'), { recursive: true });

    // Root .ctx
    writeFileSync(join(tmpDir, '.ctx'), `
version: 1
summary: "Project root context"
key_files:
  - path: "README.md"
    purpose: "Project documentation"
    tags: [docs]
    verified_at: ""
    locked: false
    owner: null
contracts: []
decisions: []
commands:
  test: "npm test"
  build: "npm run build"
gotchas: []
tags: [typescript, monorepo]
refs: []
ignore:
  never_read: []
  never_log: []
`);

    // src/auth/.ctx
    writeFileSync(join(tmpDir, 'src', 'auth', '.ctx'), `
version: 3
summary: "Authentication module — JWT validation, session management"
key_files:
  - path: "src/auth/jwt.ts"
    purpose: "JWT token validation and generation"
    tags: [auth, jwt, security]
    verified_at: "2026-03-10T10:00:00Z"
    locked: false
    owner: null
  - path: "src/auth/session.ts"
    purpose: "Session management middleware"
    tags: [auth, session]
    verified_at: "2026-03-10T10:00:00Z"
    locked: false
    owner: null
contracts:
  - name: "auth-policy"
    scope:
      paths: ["src/auth/**"]
      tags: [auth]
    content: "All auth endpoints must validate JWT before processing"
    verified_at: "2026-03-10T10:00:00Z"
    locked: true
    owner: null
decisions:
  - id: "ADR-001"
    title: "Use JWT for stateless authentication"
    status: accepted
    date: "2026-01-15"
    rationale: "Enables horizontal scaling without session storage"
    alternatives:
      - name: "Server-side sessions"
        reason_rejected: "Requires session store and doesn't scale horizontally"
    verified_at: "2026-01-15T00:00:00Z"
    locked: true
    owner: null
commands: {}
gotchas:
  - text: "JWT secret must be rotated every 90 days"
    tags: [security, jwt]
    verified_at: ""
    locked: false
tags: [auth, security, jwt]
refs:
  - target: "src/api"
    sections: [contracts]
    reason: "Auth middleware is used by API routes"
ignore:
  never_read: []
  never_log: []
`);

    // src/api/.ctx
    writeFileSync(join(tmpDir, 'src', 'api', '.ctx'), `
version: 2
summary: "API routes — REST endpoints for the application"
key_files:
  - path: "src/api/routes.ts"
    purpose: "Route definitions"
    tags: [api, routes]
    verified_at: "2026-03-08T10:00:00Z"
    locked: false
    owner: null
contracts:
  - name: "api-versioning"
    scope:
      paths: ["src/api/**"]
      tags: [api]
    content: "All endpoints must be prefixed with /api/v1/"
    verified_at: "2026-03-08T10:00:00Z"
    locked: false
    owner: null
decisions: []
commands: {}
gotchas: []
tags: [api, rest, routes]
refs: []
ignore:
  never_read: []
  never_log: []
`);

    // src/utils/.ctx
    writeFileSync(join(tmpDir, 'src', 'utils', '.ctx'), `
version: 1
summary: "Utility functions — shared helpers"
key_files:
  - path: "src/utils/logger.ts"
    purpose: "Logging utility"
    tags: [utils, logging]
    verified_at: ""
    locked: false
    owner: null
contracts: []
decisions: []
commands: {}
gotchas: []
tags: [utils, shared]
refs: []
ignore:
  never_read: []
  never_log: []
`);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Checksum computation', () => {
    it('should compute a valid SHA-256 checksum', () => {
      const content = readFileSync(join(tmpDir, 'src', 'auth', '.ctx'), 'utf-8');
      const { ctx } = parseCtxFile(content);
      const checksum = computeChecksum(ctx);

      expect(isValidChecksum(checksum)).toBe(true);
      expect(checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
    });

    it('should produce consistent checksums for same content', () => {
      const content = readFileSync(join(tmpDir, 'src', 'auth', '.ctx'), 'utf-8');
      const { ctx } = parseCtxFile(content);

      const checksum1 = computeChecksum(ctx);
      const checksum2 = computeChecksum(ctx);

      expect(checksum1).toBe(checksum2);
    });

    it('should exclude _history from checksum computation', () => {
      const content = readFileSync(join(tmpDir, 'src', 'auth', '.ctx'), 'utf-8');
      const { ctx } = parseCtxFile(content);

      const checksumWithout = computeChecksum(ctx);

      // Add _history
      ctx._history = [{
        version: 3,
        timestamp: '2026-03-10T10:00:00Z',
        author: 'agent:claude-opus',
        session_id: 'sess_test',
        reason: 'Added key file',
        checksum: 'sha256:' + '0'.repeat(64),
        diff_summary: '+1 key_file',
      }];

      const checksumWith = computeChecksum(ctx);

      expect(checksumWithout).toBe(checksumWith);
    });
  });

  describe('Index generation', () => {
    it('should generate index from multi-.ctx repo', () => {
      const index = generateIndex(tmpDir, 'test-repo');

      expect(index.version).toBe(1);
      expect(index.repo).toBe('test-repo');
      expect(index.entries).toHaveLength(4);
      expect(index.entries.map((e) => e.path).sort()).toEqual([
        '.ctx',
        'src/api/.ctx',
        'src/auth/.ctx',
        'src/utils/.ctx',
      ]);
    });

    it('should compute correct checksums for each entry', () => {
      const index = generateIndex(tmpDir);

      for (const entry of index.entries) {
        expect(isValidChecksum(entry.checksum)).toBe(true);
      }
    });

    it('should build dependency graph from refs', () => {
      const index = generateIndex(tmpDir);

      // src/auth/.ctx refs src/api
      const authEntry = index.entries.find((e) => e.path === 'src/auth/.ctx');
      expect(authEntry?.dependencies).toContain('src/api/.ctx');

      // Graph should have the dependency edge
      expect(index.graph['src/auth/.ctx']?.depends_on).toContain('src/api/.ctx');
    });

    it('should detect sections present in each entry', () => {
      const index = generateIndex(tmpDir);
      const authEntry = index.entries.find((e) => e.path === 'src/auth/.ctx');

      expect(authEntry?.sections).toContain('summary');
      expect(authEntry?.sections).toContain('key_files');
      expect(authEntry?.sections).toContain('contracts');
      expect(authEntry?.sections).toContain('decisions');
      expect(authEntry?.sections).toContain('tags');
    });

    it('should write and read index from file', () => {
      const index = generateIndex(tmpDir, 'test-repo');
      writeIndex(tmpDir, index);

      const loaded = readIndex(tmpDir);
      expect(loaded).not.toBeNull();
      expect(loaded!.entries).toHaveLength(4);
      expect(loaded!.repo).toBe('test-repo');
    });
  });

  describe('Index selection', () => {
    it('should select relevant files for auth-related prompt', () => {
      const index = generateIndex(tmpDir, 'test-repo');

      const result = selectFromIndex(index, {
        prompt: 'Fix authentication bug in JWT validation',
        cwd: join(tmpDir, 'src', 'auth'),
        repoRoot: tmpDir,
        budgetTokens: 4000,
      });

      expect(result.selected.length).toBeGreaterThan(0);

      // Auth .ctx should be selected with high score
      const authSelected = result.selected.find((s) => s.entry.path === 'src/auth/.ctx');
      expect(authSelected).toBeDefined();
      expect(authSelected!.score).toBeGreaterThan(0.5);
    });

    it('should respect budget limits', () => {
      const index = generateIndex(tmpDir, 'test-repo');

      const result = selectFromIndex(index, {
        prompt: 'Fix bug',
        cwd: tmpDir,
        repoRoot: tmpDir,
        budgetTokens: 100, // very small budget
      });

      // Total should be constrained (some might be omitted)
      expect(result.selected.length + result.omitted.length).toBe(4);
    });

    it('should handle excluded paths', () => {
      const index = generateIndex(tmpDir, 'test-repo');

      const result = selectFromIndex(index, {
        prompt: 'Fix bug',
        cwd: tmpDir,
        repoRoot: tmpDir,
        excluded: ['src/utils/.ctx'],
      });

      const utilsSelected = result.selected.find((s) => s.entry.path === 'src/utils/.ctx');
      expect(utilsSelected).toBeUndefined();
    });

    it('should complete selection in under 500ms for this fixture', () => {
      const index = generateIndex(tmpDir, 'test-repo');

      const start = performance.now();
      selectFromIndex(index, {
        prompt: 'Fix authentication bug in JWT validation',
        cwd: join(tmpDir, 'src', 'auth'),
        repoRoot: tmpDir,
        budgetTokens: 4000,
      });
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(500);
    });
  });

  describe('Incremental index update', () => {
    it('should update a single entry without full rescan', () => {
      const index = generateIndex(tmpDir, 'test-repo');
      writeIndex(tmpDir, index);

      // Modify a .ctx file
      writeFileSync(join(tmpDir, 'src', 'auth', '.ctx'), `
version: 4
summary: "Authentication module — JWT validation, session management, OAuth2"
key_files:
  - path: "src/auth/jwt.ts"
    purpose: "JWT token validation"
    tags: [auth, jwt]
    verified_at: "2026-03-15T10:00:00Z"
    locked: false
    owner: null
contracts: []
decisions: []
commands: {}
gotchas: []
tags: [auth, security, jwt, oauth2]
refs: []
ignore:
  never_read: []
  never_log: []
`);

      const result = updateIndexEntry(tmpDir, 'src/auth/.ctx');
      expect(result.updated).toBe(true);
      expect(result.entry).not.toBeNull();
      expect(result.entry!.ctx_version).toBe(4);
      expect(result.entry!.tags).toContain('oauth2');
    });
  });

  describe('V1 fallback', () => {
    it('should return null index when no .ctxl exists', () => {
      const index = readIndex(tmpDir);
      expect(index).toBeNull();
    });
  });
});
