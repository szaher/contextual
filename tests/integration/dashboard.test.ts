import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDatabase } from '../../packages/daemon/src/store/db.js';
import { createSession, getSessionById, listSessions } from '../../packages/daemon/src/store/sessions.js';
import { insertRequestEvent } from '../../packages/daemon/src/store/events.js';
import { queryAuditEntries, insertAuditEntry } from '../../packages/daemon/src/store/audit.js';
import { insertDiff, queryDiffs } from '../../packages/daemon/src/store/diffs.js';

describe('Integration: Dashboard API Data', () => {
  let db: ReturnType<typeof openDatabase>;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxl-dashboard-test-'));
    db = openDatabase(join(tmpDir, 'test.db'));
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should provide session list with request counts for dashboard', () => {
    const s1 = createSession(db, { repo_path: '/repo', working_dir: '/repo/src', agent_id: 'claude' });
    insertRequestEvent(db, { session_id: s1.id, request_text: 'r1', context_pack: '{}', omitted_items: null, token_count: 100, budget: 4000, deep_read: null });
    insertRequestEvent(db, { session_id: s1.id, request_text: 'r2', context_pack: '{}', omitted_items: null, token_count: 200, budget: 4000, deep_read: null });

    const list = listSessions(db);
    expect(list.sessions[0].request_count).toBe(2);
    expect(list.sessions[0].agent_id).toBe('claude');
  });

  it('should provide session detail with event timeline for drill-down', () => {
    const session = createSession(db, { repo_path: '/repo', working_dir: '/repo/src' });
    insertRequestEvent(db, { session_id: session.id, request_text: 'fix auth', context_pack: '{"items":[]}', omitted_items: '[]', token_count: 1500, budget: 4000, deep_read: null });

    const detail = getSessionById(db, session.id);
    expect(detail!.events).toHaveLength(1);
    expect(detail!.events[0].request_text).toBe('fix auth');
    expect(detail!.events[0].token_count).toBe(1500);
  });

  it('should provide proposals for ctx browser', () => {
    insertDiff(db, { ctx_path: 'src/.ctx', diff_content: 'test diff', provenance: '{}' });
    const result = queryDiffs(db, { status: 'proposed' });
    expect(result.total).toBe(1);
  });

  it('should provide audit entries with filters for audit page', () => {
    insertAuditEntry(db, { ctx_path: 'src/.ctx', change_type: 'update', diff_content: 'd', initiated_by: 'user', reason: 'test' });
    insertAuditEntry(db, { ctx_path: 'lib/.ctx', change_type: 'create', diff_content: 'd', initiated_by: 'system', reason: 'auto' });

    const all = queryAuditEntries(db);
    expect(all.total).toBe(2);

    const filtered = queryAuditEntries(db, { ctx_path: 'src/.ctx' });
    expect(filtered.total).toBe(1);
  });
});
