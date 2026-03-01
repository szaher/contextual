import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDatabase } from '../../packages/daemon/src/store/db.js';
import { createSession, getSessionById, listSessions, endSession } from '../../packages/daemon/src/store/sessions.js';
import { insertRequestEvent, getEventsBySession } from '../../packages/daemon/src/store/events.js';
import { insertAuditEntry, queryAuditEntries } from '../../packages/daemon/src/store/audit.js';

describe('Integration: Daemon API — Session & Event Tracking', () => {
  let db: ReturnType<typeof openDatabase>;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxl-daemon-test-'));
    db = openDatabase(join(tmpDir, 'test.db'));
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should create a session with active status', () => {
    const session = createSession(db, {
      repo_path: '/path/to/repo',
      working_dir: '/path/to/repo/src',
      branch: 'main',
      agent_id: 'claude',
      agent_config: { budget_tokens: 8000 },
    });

    expect(session.id).toMatch(/^sess_/);
    expect(session.status).toBe('active');
    expect(session.repo_path).toBe('/path/to/repo');
    expect(session.agent_id).toBe('claude');
    expect(session.ended_at).toBeNull();
  });

  it('should get session by ID with events', () => {
    const session = createSession(db, {
      repo_path: '/repo',
      working_dir: '/repo/src',
    });

    // Add events
    insertRequestEvent(db, {
      session_id: session.id,
      request_text: 'fix the auth bug',
      context_pack: '{}',
      omitted_items: '[]',
      token_count: 2340,
      budget: 4000,
      deep_read: null,
    });
    insertRequestEvent(db, {
      session_id: session.id,
      request_text: 'add unit tests',
      context_pack: '{}',
      omitted_items: null,
      token_count: 1500,
      budget: 4000,
      deep_read: null,
    });

    const detail = getSessionById(db, session.id);
    expect(detail).not.toBeNull();
    expect(detail!.events).toHaveLength(2);
    expect(detail!.events[0].request_text).toBe('fix the auth bug');
    expect(detail!.events[1].request_text).toBe('add unit tests');
  });

  it('should list sessions with filters', () => {
    createSession(db, { repo_path: '/repo1', working_dir: '/repo1/src' });
    createSession(db, { repo_path: '/repo2', working_dir: '/repo2/src' });
    const s3 = createSession(db, { repo_path: '/repo1', working_dir: '/repo1/lib' });
    endSession(db, s3.id);

    const all = listSessions(db);
    expect(all.total).toBe(3);

    const active = listSessions(db, { status: 'active' });
    expect(active.total).toBe(2);

    const byRepo = listSessions(db, { repo_path: '/repo1' });
    expect(byRepo.total).toBe(2);
  });

  it('should end a session', () => {
    const session = createSession(db, {
      repo_path: '/repo',
      working_dir: '/repo/src',
    });

    const ended = endSession(db, session.id);
    expect(ended).not.toBeNull();
    expect(ended!.status).toBe('completed');
    expect(ended!.ended_at).toBeTruthy();

    // Ending again should return null
    const again = endSession(db, session.id);
    expect(again).toBeNull();
  });

  it('should record events with correct session attribution', () => {
    const s1 = createSession(db, { repo_path: '/repo', working_dir: '/repo/src' });
    const s2 = createSession(db, { repo_path: '/repo', working_dir: '/repo/lib' });

    insertRequestEvent(db, {
      session_id: s1.id,
      request_text: 'session 1 request',
      context_pack: '{}',
      omitted_items: null,
      token_count: 1000,
      budget: 4000,
      deep_read: null,
    });
    insertRequestEvent(db, {
      session_id: s2.id,
      request_text: 'session 2 request',
      context_pack: '{}',
      omitted_items: null,
      token_count: 2000,
      budget: 4000,
      deep_read: null,
    });

    const s1Events = getEventsBySession(db, s1.id);
    expect(s1Events).toHaveLength(1);
    expect(s1Events[0].request_text).toBe('session 1 request');

    const s2Events = getEventsBySession(db, s2.id);
    expect(s2Events).toHaveLength(1);
    expect(s2Events[0].request_text).toBe('session 2 request');
  });

  it('should query audit log with filters', () => {
    insertAuditEntry(db, {
      ctx_path: 'src/auth/.ctx',
      change_type: 'update',
      diff_content: 'diff1',
      initiated_by: 'user',
      reason: 'Manual update',
    });
    insertAuditEntry(db, {
      ctx_path: 'src/api/.ctx',
      change_type: 'create',
      diff_content: 'diff2',
      initiated_by: 'system',
      reason: 'Auto-generated',
    });

    const all = queryAuditEntries(db);
    expect(all.total).toBe(2);

    const authOnly = queryAuditEntries(db, { ctx_path: 'src/auth/.ctx' });
    expect(authOnly.total).toBe(1);
    expect(authOnly.entries[0].change_type).toBe('update');
  });

  it('should handle full session lifecycle with events and audit', () => {
    // Create session
    const session = createSession(db, {
      repo_path: '/repo',
      working_dir: '/repo/src/auth',
      branch: 'feature/auth',
      agent_id: 'claude',
    });

    // Record multiple requests
    for (let i = 1; i <= 3; i++) {
      insertRequestEvent(db, {
        session_id: session.id,
        request_text: `Request ${i}`,
        context_pack: JSON.stringify({ items: [] }),
        omitted_items: '[]',
        token_count: i * 500,
        budget: 4000,
        deep_read: null,
      });
    }

    // Create audit entry
    insertAuditEntry(db, {
      ctx_path: 'src/auth/.ctx',
      change_type: 'update',
      diff_content: 'some diff',
      initiated_by: session.id,
      reason: 'Context updated during session',
    });

    // End session
    endSession(db, session.id);

    // Verify final state
    const detail = getSessionById(db, session.id);
    expect(detail!.status).toBe('completed');
    expect(detail!.events).toHaveLength(3);
    expect(detail!.ended_at).toBeTruthy();

    // Verify audit
    const audit = queryAuditEntries(db, { initiated_by: session.id });
    expect(audit.total).toBe(1);

    // Verify list shows completed with request count
    const list = listSessions(db, { status: 'completed' });
    expect(list.total).toBe(1);
    expect(list.sessions[0].request_count).toBe(3);
  });
});
