import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseCtxFile, serializeCtxFile, threeWayMerge, resolveAllConflicts, bumpVersion, acquireLock } from '@ctxkit/core';
import type { CtxFile } from '@ctxkit/core';

describe('Multi-Agent Conflict E2E (US3)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxl-conflict-e2e-'));
    mkdirSync(join(tmpDir, 'src', 'auth'), { recursive: true });

    writeFileSync(join(tmpDir, 'src', 'auth', '.ctx'), `
version: 1
summary: "Auth module"
key_files:
  - path: "src/auth/jwt.ts"
    purpose: "JWT validation"
    tags: [auth]
    verified_at: ""
    locked: false
    owner: null
contracts: []
decisions: []
commands: {}
gotchas: []
tags: [auth]
refs: []
ignore:
  never_read: []
  never_log: []
`);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should simulate concurrent agent writes with clean merge', async () => {
    const ctxPath = join(tmpDir, 'src', 'auth', '.ctx');
    const content = readFileSync(ctxPath, 'utf-8');
    const { ctx: base } = parseCtxFile(content);

    // Agent A reads the file (gets base version)
    const agentABase = { ...base };

    // Agent B reads the file (gets same base version)
    const agentBBase = { ...base };

    // Agent A acquires lock and makes changes
    const lockA = await acquireLock(tmpDir, 'src/auth/.ctx', 'agent:opus:sess_a', 'update');
    const agentAChanges: CtxFile = {
      ...agentABase,
      key_files: [
        ...agentABase.key_files,
        { path: 'src/auth/middleware.ts', purpose: 'Auth middleware', tags: ['auth'], verified_at: '', locked: false, owner: null },
      ],
      tags: [...agentABase.tags, 'middleware'],
    };
    const agentABumped = bumpVersion(agentAChanges, {
      author: 'agent:opus',
      reason: 'Added auth middleware',
      session_id: 'sess_a',
    });
    writeFileSync(ctxPath, serializeCtxFile(agentABumped), 'utf-8');
    await lockA.release();

    // Agent B acquires lock and tries to write
    const lockB = await acquireLock(tmpDir, 'src/auth/.ctx', 'agent:sonnet:sess_b', 'update');

    // Agent B reads the current file to detect version conflict
    const currentContent = readFileSync(ctxPath, 'utf-8');
    const { ctx: currentCtx } = parseCtxFile(currentContent);

    // Version mismatch detected — Agent B's base is version 1, current is version 2
    expect(currentCtx.version).toBe(2);
    expect(agentBBase.version).toBe(1);

    // Agent B performs three-way merge
    const agentBChanges: CtxFile = {
      ...agentBBase,
      key_files: [
        ...agentBBase.key_files,
        { path: 'src/auth/rbac.ts', purpose: 'Role-based access control', tags: ['auth', 'rbac'], verified_at: '', locked: false, owner: null },
      ],
      tags: [...agentBBase.tags, 'rbac'],
    };

    const mergeResult = threeWayMerge(base, currentCtx, agentBChanges);

    // Non-overlapping changes → clean merge
    expect(mergeResult.clean).toBe(true);
    expect(mergeResult.merged.key_files).toHaveLength(3);
    expect(mergeResult.merged.tags).toContain('middleware');
    expect(mergeResult.merged.tags).toContain('rbac');

    // Write merged result
    const merged = mergeResult.merged as CtxFile;
    const mergedBumped = bumpVersion(merged, {
      author: 'agent:sonnet',
      reason: 'Merged with concurrent changes, added RBAC',
      session_id: 'sess_b',
    });
    writeFileSync(ctxPath, serializeCtxFile(mergedBumped), 'utf-8');
    await lockB.release();

    // Verify final state
    const finalContent = readFileSync(ctxPath, 'utf-8');
    const { ctx: finalCtx } = parseCtxFile(finalContent);
    expect(finalCtx.version).toBeGreaterThan(2);
    expect(finalCtx.key_files).toHaveLength(3);
    expect(finalCtx.tags).toContain('auth');
    expect(finalCtx.tags).toContain('middleware');
    expect(finalCtx.tags).toContain('rbac');
  });

  it('should simulate concurrent agent writes with conflicting merge and resolution', async () => {
    const ctxPath = join(tmpDir, 'src', 'auth', '.ctx');
    const content = readFileSync(ctxPath, 'utf-8');
    const { ctx: base } = parseCtxFile(content);

    // Both agents modify the same key_file differently
    const agentAChanges: CtxFile = {
      ...base,
      key_files: [
        { ...base.key_files[0], purpose: 'JWT validation with refresh tokens' },
      ],
      _history: [{ version: 2, timestamp: new Date().toISOString(), author: 'agent:opus', session_id: 'sess_a', reason: 'Updated JWT purpose', checksum: 'sha256:' + 'a'.repeat(64), diff_summary: '~1 key_files' }],
    };

    const agentBChanges: CtxFile = {
      ...base,
      key_files: [
        { ...base.key_files[0], purpose: 'JWT token management and rotation' },
      ],
      _history: [{ version: 2, timestamp: new Date().toISOString(), author: 'agent:sonnet', session_id: 'sess_b', reason: 'Changed JWT description', checksum: 'sha256:' + 'b'.repeat(64), diff_summary: '~1 key_files' }],
    };

    // Three-way merge detects conflict
    const mergeResult = threeWayMerge(base, agentAChanges, agentBChanges);
    expect(mergeResult.clean).toBe(false);
    expect(mergeResult.conflicts).toHaveLength(1);
    expect(mergeResult.conflicts[0].section).toBe('key_files');
    expect(mergeResult.conflicts[0].key).toBe('src/auth/jwt.ts');

    // Resolve via pick_ours (Agent A's version wins)
    const resolved = resolveAllConflicts(
      mergeResult.merged as CtxFile,
      mergeResult.conflicts,
      'pick_ours',
      'developer:szaher',
    );

    expect(resolved.key_files[0].purpose).toBe('JWT validation with refresh tokens');
    expect(resolved._history).toBeDefined();
    expect(resolved._history!.some((h) => h.reason.includes('Resolved'))).toBe(true);

    // Write result
    writeFileSync(ctxPath, serializeCtxFile(resolved), 'utf-8');

    // Verify the serialized file can be read back
    const finalContent = readFileSync(ctxPath, 'utf-8');
    const { ctx: finalCtx } = parseCtxFile(finalContent);
    expect(finalCtx.key_files[0].purpose).toBe('JWT validation with refresh tokens');
  });

  it('should handle lock contention between agents', async () => {
    // Agent A acquires lock
    const lockA = await acquireLock(tmpDir, 'src/auth/.ctx', 'agent:opus:sess_a', 'update');

    // Agent B tries to acquire — should fail (short TTL for test speed)
    await expect(
      acquireLock(tmpDir, 'src/auth/.ctx', 'agent:sonnet:sess_b', 'update', 500),
    ).rejects.toThrow('Lock acquisition failed');

    // Agent A releases
    await lockA.release();

    // Now Agent B can acquire
    const lockB = await acquireLock(tmpDir, 'src/auth/.ctx', 'agent:sonnet:sess_b', 'update');
    expect(lockB.lock.holder).toBe('agent:sonnet:sess_b');
    await lockB.release();
  });
});
