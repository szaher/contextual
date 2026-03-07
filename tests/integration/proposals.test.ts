import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { insertDiff, getDiffById, queryDiffs, updateDiffStatus } from '../../packages/daemon/src/store/diffs.js';
import { insertAuditEntry, queryAuditEntries } from '../../packages/daemon/src/store/audit.js';
import { openDatabase } from '../../packages/daemon/src/store/db.js';
import { createApp } from '../../packages/daemon/src/server.js';

describe('Integration: Proposal Lifecycle', () => {
  let db: ReturnType<typeof openDatabase>;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxl-test-'));
    db = openDatabase(join(tmpDir, 'test.db'));
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should create a proposal with proposed status', () => {
    const diff = insertDiff(db, {
      ctx_path: 'src/auth/.ctx',
      diff_content: '--- a/src/auth/.ctx\n+++ b/src/auth/.ctx\n@@ -1,3 +1,3 @@\n-old line\n+new line',
      provenance: JSON.stringify({ source_file: 'src/auth/handler.ts', trigger: 'symbol_renamed' }),
    });

    expect(diff.id).toMatch(/^diff_/);
    expect(diff.status).toBe('proposed');
    expect(diff.ctx_path).toBe('src/auth/.ctx');
    expect(diff.resolved_at).toBeNull();
  });

  it('should query proposals by status', () => {
    insertDiff(db, {
      ctx_path: 'src/auth/.ctx',
      diff_content: 'diff1',
      provenance: '{}',
    });
    insertDiff(db, {
      ctx_path: 'src/api/.ctx',
      diff_content: 'diff2',
      provenance: '{}',
    });

    const proposed = queryDiffs(db, { status: 'proposed' });
    expect(proposed.total).toBe(2);
    expect(proposed.diffs).toHaveLength(2);

    const byPath = queryDiffs(db, { ctx_path: 'src/auth/.ctx' });
    expect(byPath.total).toBe(1);
    expect(byPath.diffs[0].ctx_path).toBe('src/auth/.ctx');
  });

  it('should approve a proposal', () => {
    const diff = insertDiff(db, {
      ctx_path: 'src/auth/.ctx',
      diff_content: 'test diff',
      provenance: '{}',
    });

    const updated = updateDiffStatus(db, diff.id, 'approved', 'user');
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe('approved');
    expect(updated!.resolved_by).toBe('user');
    expect(updated!.resolved_at).toBeTruthy();
  });

  it('should reject a proposal', () => {
    const diff = insertDiff(db, {
      ctx_path: 'src/auth/.ctx',
      diff_content: 'test diff',
      provenance: '{}',
    });

    const updated = updateDiffStatus(db, diff.id, 'rejected', 'user');
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe('rejected');
  });

  it('should complete full lifecycle: propose → approve → apply with audit', () => {
    // Step 1: Create a proposal
    const diff = insertDiff(db, {
      session_id: null,
      event_id: null,
      ctx_path: 'src/auth/.ctx',
      diff_content: '--- a/src/auth/.ctx\n+++ b/src/auth/.ctx\n@@ -1 +1 @@\n-old\n+new',
      provenance: JSON.stringify({
        source_file: 'src/auth/handler.ts',
        commit: 'abc123',
        trigger: 'symbol_renamed',
      }),
    });
    expect(diff.status).toBe('proposed');

    // Step 2: Approve the proposal
    const approved = updateDiffStatus(db, diff.id, 'approved', 'user');
    expect(approved!.status).toBe('approved');

    // Step 3: Apply — create audit entry and mark as applied
    const audit = insertAuditEntry(db, {
      ctx_path: diff.ctx_path,
      change_type: 'update',
      diff_content: diff.diff_content,
      initiated_by: 'user',
      reason: `Applied proposal ${diff.id}`,
    });
    expect(audit.id).toMatch(/^aud_/);
    expect(audit.change_type).toBe('update');

    const applied = updateDiffStatus(db, diff.id, 'applied', 'user');
    expect(applied!.status).toBe('applied');

    // Step 4: Verify audit log
    const auditResults = queryAuditEntries(db, { ctx_path: 'src/auth/.ctx' });
    expect(auditResults.total).toBe(1);
    expect(auditResults.entries[0].ctx_path).toBe('src/auth/.ctx');
    expect(auditResults.entries[0].reason).toContain(diff.id);

    // Step 5: Verify final state
    const finalDiff = getDiffById(db, diff.id);
    expect(finalDiff!.status).toBe('applied');
    expect(finalDiff!.resolved_by).toBe('user');
  });

  it('should return null when updating non-existent proposal', () => {
    const result = updateDiffStatus(db, 'nonexistent', 'approved', 'user');
    expect(result).toBeNull();
  });

  it('should handle pagination in queries', () => {
    for (let i = 0; i < 5; i++) {
      insertDiff(db, {
        ctx_path: `path-${i}/.ctx`,
        diff_content: `diff-${i}`,
        provenance: '{}',
      });
    }

    const page1 = queryDiffs(db, { limit: 2, offset: 0 });
    expect(page1.total).toBe(5);
    expect(page1.diffs).toHaveLength(2);

    const page2 = queryDiffs(db, { limit: 2, offset: 2 });
    expect(page2.diffs).toHaveLength(2);

    const page3 = queryDiffs(db, { limit: 2, offset: 4 });
    expect(page3.diffs).toHaveLength(1);
  });

  it('should store source_hash when inserting a diff', () => {
    const diff = insertDiff(db, {
      ctx_path: 'src/auth/.ctx',
      diff_content: 'new content',
      provenance: '{}',
      source_hash: 'abc123hash',
    });

    expect(diff.source_hash).toBe('abc123hash');

    const fetched = getDiffById(db, diff.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.source_hash).toBe('abc123hash');
  });

  it('should default source_hash to null when not provided', () => {
    const diff = insertDiff(db, {
      ctx_path: 'src/auth/.ctx',
      diff_content: 'new content',
      provenance: '{}',
    });

    expect(diff.source_hash).toBeNull();

    const fetched = getDiffById(db, diff.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.source_hash).toBeNull();
  });
});

describe('Integration: Proposal Apply with Conflict Detection (T036-T037)', () => {
  let db: ReturnType<typeof openDatabase>;
  let tmpDir: string;
  let repoDir: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxl-apply-test-'));
    db = openDatabase(join(tmpDir, 'test.db'));
    repoDir = join(tmpDir, 'repo');
    mkdirSync(join(repoDir, 'src', 'auth'), { recursive: true });
    app = createApp({ db, startedAt: new Date() });
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('T036: should create proposal, approve, apply, and verify file content', async () => {
    // Step 1: Write the initial .ctx file
    const ctxPath = join(repoDir, 'src', 'auth', '.ctx');
    const originalContent = 'version: 1\nsummary: "Auth module"\n';
    writeFileSync(ctxPath, originalContent, 'utf8');

    // Step 2: Create a proposal with repo_root so source_hash is computed
    const newContent = 'version: 1\nsummary: "Auth module - updated"\nkey_files: []\n';
    const createRes = await app.request('/api/v1/proposals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ctx_path: 'src/auth/.ctx',
        diff_content: newContent,
        provenance: JSON.stringify({ trigger: 'manual' }),
        repo_root: repoDir,
      }),
    });
    expect(createRes.status).toBe(201);
    const createData = await createRes.json();
    expect(createData.source_hash).toBeTruthy();

    // Step 3: Approve the proposal
    const approveRes = await app.request(`/api/v1/proposals/${createData.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    });
    expect(approveRes.status).toBe(200);

    // Step 4: Apply the proposal
    const applyRes = await app.request(`/api/v1/proposals/${createData.id}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_root: repoDir }),
    });
    expect(applyRes.status).toBe(200);
    const applyData = await applyRes.json();
    expect(applyData.status).toBe('applied');
    expect(applyData.audit_id).toMatch(/^aud_/);

    // Step 5: Verify the file content was updated
    const fileContent = readFileSync(ctxPath, 'utf8');
    expect(fileContent).toBe(newContent);

    // Step 6: Verify the proposal is marked as applied in DB
    const finalDiff = getDiffById(db, createData.id);
    expect(finalDiff!.status).toBe('applied');
  });

  it('T037: should return 409 Conflict when file is modified after proposal creation', async () => {
    // Step 1: Write the initial .ctx file
    const ctxPath = join(repoDir, 'src', 'auth', '.ctx');
    const originalContent = 'version: 1\nsummary: "Auth module"\n';
    writeFileSync(ctxPath, originalContent, 'utf8');

    // Step 2: Create a proposal
    const createRes = await app.request('/api/v1/proposals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ctx_path: 'src/auth/.ctx',
        diff_content: 'version: 1\nsummary: "Auth module - updated"\n',
        provenance: '{}',
        repo_root: repoDir,
      }),
    });
    expect(createRes.status).toBe(201);
    const createData = await createRes.json();

    // Step 3: Modify the file after proposal was created
    writeFileSync(ctxPath, 'version: 1\nsummary: "Auth module - someone else changed this"\n', 'utf8');

    // Step 4: Approve the proposal
    const approveRes = await app.request(`/api/v1/proposals/${createData.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    });
    expect(approveRes.status).toBe(200);

    // Step 5: Try to apply — should fail with 409
    const applyRes = await app.request(`/api/v1/proposals/${createData.id}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_root: repoDir }),
    });
    expect(applyRes.status).toBe(409);
    const applyData = await applyRes.json();
    expect(applyData.error.code).toBe('CONFLICT');
    expect(applyData.error.message).toBe('File has been modified since proposal was created');
    expect(applyData.error.ctx_path).toBe('src/auth/.ctx');
    expect(applyData.error.expected_hash).toBe(createData.source_hash);
    expect(applyData.error.actual_hash).toBeTruthy();
    expect(applyData.error.actual_hash).not.toBe(applyData.error.expected_hash);
  });

  it('T037: should detect conflict when two proposals target the same file and first is applied', async () => {
    // Step 1: Write the initial .ctx file
    const ctxPath = join(repoDir, 'src', 'auth', '.ctx');
    const originalContent = 'version: 1\nsummary: "Auth module"\n';
    writeFileSync(ctxPath, originalContent, 'utf8');

    // Step 2: Create two proposals for the same file
    const createRes1 = await app.request('/api/v1/proposals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ctx_path: 'src/auth/.ctx',
        diff_content: 'version: 1\nsummary: "Auth module - proposal 1"\n',
        provenance: '{}',
        repo_root: repoDir,
      }),
    });
    expect(createRes1.status).toBe(201);
    const data1 = await createRes1.json();

    const createRes2 = await app.request('/api/v1/proposals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ctx_path: 'src/auth/.ctx',
        diff_content: 'version: 1\nsummary: "Auth module - proposal 2"\n',
        provenance: '{}',
        repo_root: repoDir,
      }),
    });
    expect(createRes2.status).toBe(201);
    const data2 = await createRes2.json();

    // Both proposals should have the same source_hash (created from same original file)
    expect(data1.source_hash).toBe(data2.source_hash);

    // Step 3: Approve both proposals
    await app.request(`/api/v1/proposals/${data1.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    });
    await app.request(`/api/v1/proposals/${data2.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    });

    // Step 4: Apply the first proposal — should succeed
    const applyRes1 = await app.request(`/api/v1/proposals/${data1.id}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_root: repoDir }),
    });
    expect(applyRes1.status).toBe(200);
    const applyData1 = await applyRes1.json();
    expect(applyData1.status).toBe('applied');

    // Step 5: Apply the second proposal — should fail with 409 because file changed
    const applyRes2 = await app.request(`/api/v1/proposals/${data2.id}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_root: repoDir }),
    });
    expect(applyRes2.status).toBe(409);
    const applyData2 = await applyRes2.json();
    expect(applyData2.error.code).toBe('CONFLICT');
    expect(applyData2.error.expected_hash).toBe(data2.source_hash);
  });

  it('should return 404 when .ctx file not found during apply', async () => {
    // Create a proposal for a file that exists initially
    const ctxPath = join(repoDir, 'src', 'auth', '.ctx');
    writeFileSync(ctxPath, 'version: 1\n', 'utf8');

    const createRes = await app.request('/api/v1/proposals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ctx_path: 'src/auth/.ctx',
        diff_content: 'version: 2\n',
        provenance: '{}',
        repo_root: repoDir,
      }),
    });
    expect(createRes.status).toBe(201);
    const createData = await createRes.json();

    // Delete the file
    rmSync(ctxPath);

    // Approve
    await app.request(`/api/v1/proposals/${createData.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    });

    // Apply — should fail with 404
    const applyRes = await app.request(`/api/v1/proposals/${createData.id}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_root: repoDir }),
    });
    expect(applyRes.status).toBe(404);
    const applyData = await applyRes.json();
    expect(applyData.error.code).toBe('NOT_FOUND');
    expect(applyData.error.message).toBe('Target .ctx file not found');
    expect(applyData.error.ctx_path).toBe('src/auth/.ctx');
  });

  it('should return 400 when ctx_path is outside repository root', async () => {
    // Create a proposal with path traversal
    const ctxPath = join(repoDir, 'src', 'auth', '.ctx');
    writeFileSync(ctxPath, 'version: 1\n', 'utf8');

    const diff = insertDiff(db, {
      ctx_path: '../../etc/passwd',
      diff_content: 'malicious content',
      provenance: '{}',
      source_hash: 'somehash',
    });
    updateDiffStatus(db, diff.id, 'approved', 'user');

    const applyRes = await app.request(`/api/v1/proposals/${diff.id}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_root: repoDir }),
    });
    expect(applyRes.status).toBe(400);
    const applyData = await applyRes.json();
    expect(applyData.error.code).toBe('BAD_REQUEST');
    expect(applyData.error.message).toBe('ctx_path outside repository root');
  });
});
