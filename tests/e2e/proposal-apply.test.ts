import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../../packages/daemon/src/server.js';
import { openDatabase } from '../../packages/daemon/src/store/db.js';
import type Database from 'better-sqlite3';

/**
 * T038 -- E2E test: Full proposal apply workflow
 *
 * Tests the complete lifecycle: start daemon (via app.request()),
 * create session, propose update, approve, apply, read file to confirm changes.
 */
describe('E2E: Proposal Apply Workflow (T038)', () => {
  let db: Database.Database;
  let tmpDir: string;
  let repoDir: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxl-e2e-apply-'));
    db = openDatabase(join(tmpDir, 'test.db'));
    repoDir = join(tmpDir, 'repo');
    mkdirSync(join(repoDir, 'src', 'auth'), { recursive: true });
    app = createApp({ db, startedAt: new Date() });
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should complete full workflow: session → propose → approve → apply → verify file', async () => {
    // Step 1: Create a session
    const sessionRes = await app.request('/api/v1/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repo_path: repoDir,
        working_dir: join(repoDir, 'src', 'auth'),
        branch: 'main',
        agent_id: 'test-agent',
      }),
    });
    expect(sessionRes.status).toBe(201);
    const sessionData = await sessionRes.json();
    expect(sessionData.id).toMatch(/^sess_/);

    // Step 2: Write the initial .ctx file
    const ctxPath = join(repoDir, 'src', 'auth', '.ctx');
    const originalContent = `version: 1
summary: "Authentication module"
key_files:
  - path: handler.ts
    why: "Main auth handler"
tags: [auth, security]
`;
    writeFileSync(ctxPath, originalContent, 'utf8');

    // Step 3: Create a proposal for updating the .ctx file
    const proposedContent = `version: 1
summary: "Authentication module with OAuth2 support"
key_files:
  - path: handler.ts
    why: "Main auth handler"
  - path: oauth2.ts
    why: "OAuth2 integration"
tags: [auth, security, oauth2]
`;
    const proposeRes = await app.request('/api/v1/proposals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionData.id,
        ctx_path: 'src/auth/.ctx',
        diff_content: proposedContent,
        provenance: JSON.stringify({
          source_file: 'src/auth/oauth2.ts',
          trigger: 'new_file_added',
        }),
        repo_root: repoDir,
      }),
    });
    expect(proposeRes.status).toBe(201);
    const proposeData = await proposeRes.json();
    expect(proposeData.id).toMatch(/^diff_/);
    expect(proposeData.status).toBe('proposed');
    expect(proposeData.source_hash).toBeTruthy();

    // Step 4: Verify the proposal is listed
    const listRes = await app.request('/api/v1/proposals?status=proposed');
    expect(listRes.status).toBe(200);
    const listData = await listRes.json();
    expect(listData.total).toBeGreaterThanOrEqual(1);
    const foundProposal = listData.proposals.find(
      (p: { id: string }) => p.id === proposeData.id,
    );
    expect(foundProposal).toBeDefined();
    expect(foundProposal.ctx_path).toBe('src/auth/.ctx');

    // Step 5: Approve the proposal
    const approveRes = await app.request(`/api/v1/proposals/${proposeData.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    });
    expect(approveRes.status).toBe(200);
    const approveData = await approveRes.json();
    expect(approveData.status).toBe('approved');

    // Step 6: Apply the proposal
    const applyRes = await app.request(`/api/v1/proposals/${proposeData.id}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_root: repoDir }),
    });
    expect(applyRes.status).toBe(200);
    const applyData = await applyRes.json();
    expect(applyData.status).toBe('applied');
    expect(applyData.audit_id).toMatch(/^aud_/);

    // Step 7: Read the file and verify content matches proposed content
    const updatedContent = readFileSync(ctxPath, 'utf8');
    expect(updatedContent).toBe(proposedContent);

    // Step 8: Verify the proposal status is 'applied' via API
    const getRes = await app.request(`/api/v1/proposals?ctx_path=src/auth/.ctx`);
    expect(getRes.status).toBe(200);
    const getData = await getRes.json();
    const appliedProposal = getData.proposals.find(
      (p: { id: string }) => p.id === proposeData.id,
    );
    expect(appliedProposal.status).toBe('applied');

    // Step 9: Verify audit trail
    const auditRes = await app.request('/api/v1/audit?ctx_path=src/auth/.ctx');
    expect(auditRes.status).toBe(200);
    const auditData = await auditRes.json();
    expect(auditData.total).toBeGreaterThanOrEqual(1);
    const auditEntry = auditData.entries.find(
      (e: { id: string }) => e.id === applyData.audit_id,
    );
    expect(auditEntry).toBeDefined();
    expect(auditEntry.change_type).toBe('update');
    expect(auditEntry.reason).toContain(proposeData.id);
  });

  it('should detect conflict when file changes between propose and apply', async () => {
    // Step 1: Write the initial .ctx file
    const ctxPath = join(repoDir, 'src', 'auth', '.ctx');
    const originalContent = 'version: 1\nsummary: "Auth module"\n';
    writeFileSync(ctxPath, originalContent, 'utf8');

    // Step 2: Create proposal
    const proposeRes = await app.request('/api/v1/proposals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ctx_path: 'src/auth/.ctx',
        diff_content: 'version: 1\nsummary: "Auth module v2"\n',
        provenance: '{}',
        repo_root: repoDir,
      }),
    });
    expect(proposeRes.status).toBe(201);
    const proposeData = await proposeRes.json();

    // Step 3: Simulate external modification of the file
    writeFileSync(ctxPath, 'version: 1\nsummary: "Auth module - external change"\n', 'utf8');

    // Step 4: Approve
    await app.request(`/api/v1/proposals/${proposeData.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    });

    // Step 5: Apply — should fail with 409
    const applyRes = await app.request(`/api/v1/proposals/${proposeData.id}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_root: repoDir }),
    });
    expect(applyRes.status).toBe(409);
    const applyData = await applyRes.json();
    expect(applyData.error.code).toBe('CONFLICT');
    expect(applyData.error.ctx_path).toBe('src/auth/.ctx');
    expect(applyData.error.expected_hash).toBeTruthy();
    expect(applyData.error.actual_hash).toBeTruthy();
    expect(applyData.error.expected_hash).not.toBe(applyData.error.actual_hash);

    // Step 6: Verify the file was NOT overwritten
    const fileContent = readFileSync(ctxPath, 'utf8');
    expect(fileContent).toBe('version: 1\nsummary: "Auth module - external change"\n');
  });

  it('should return 404 when target .ctx file is deleted before apply', async () => {
    // Step 1: Write the initial .ctx file
    const ctxPath = join(repoDir, 'src', 'auth', '.ctx');
    writeFileSync(ctxPath, 'version: 1\n', 'utf8');

    // Step 2: Create and approve proposal
    const proposeRes = await app.request('/api/v1/proposals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ctx_path: 'src/auth/.ctx',
        diff_content: 'version: 2\n',
        provenance: '{}',
        repo_root: repoDir,
      }),
    });
    const proposeData = await proposeRes.json();

    await app.request(`/api/v1/proposals/${proposeData.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    });

    // Step 3: Delete the file
    rmSync(ctxPath);

    // Step 4: Apply — should fail with 404
    const applyRes = await app.request(`/api/v1/proposals/${proposeData.id}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_root: repoDir }),
    });
    expect(applyRes.status).toBe(404);
    const applyData = await applyRes.json();
    expect(applyData.error.code).toBe('NOT_FOUND');
    expect(applyData.error.message).toBe('Target .ctx file not found');
  });

  it('should reject path traversal attempts during apply', async () => {
    // Directly insert a proposal with path traversal in DB
    const { insertDiff, updateDiffStatus } = await import(
      '../../packages/daemon/src/store/diffs.js'
    );

    const diff = insertDiff(db, {
      ctx_path: '../../../etc/hosts',
      diff_content: 'malicious',
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

  it('should still work without repo_root (backward compatible, no file I/O)', async () => {
    // Create a proposal without repo_root
    const proposeRes = await app.request('/api/v1/proposals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ctx_path: 'src/auth/.ctx',
        diff_content: 'new content',
        provenance: '{}',
      }),
    });
    expect(proposeRes.status).toBe(201);
    const proposeData = await proposeRes.json();
    expect(proposeData.source_hash).toBeNull();

    // Approve
    await app.request(`/api/v1/proposals/${proposeData.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    });

    // Apply without repo_root — should succeed (DB-only, no file I/O)
    const applyRes = await app.request(`/api/v1/proposals/${proposeData.id}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(applyRes.status).toBe(200);
    const applyData = await applyRes.json();
    expect(applyData.status).toBe('applied');
  });
});
