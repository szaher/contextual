import { Hono } from 'hono';
import { insertDiff, getDiffById, queryDiffs, updateDiffStatus } from '../store/diffs.js';
import { insertAuditEntry } from '../store/audit.js';
import type { AppEnv } from '../types.js';

const proposals = new Hono<AppEnv>();

// POST /proposals — create a proposal
proposals.post('/proposals', async (c) => {
  const db = c.get('db');
  const body = await c.req.json();

  const { session_id, event_id, ctx_path, diff_content, provenance } = body;

  if (!ctx_path || !diff_content || !provenance) {
    return c.json(
      {
        error: {
          code: 'BAD_REQUEST',
          message: 'ctx_path, diff_content, and provenance are required',
        },
      },
      400,
    );
  }

  const diff = insertDiff(db, {
    session_id: session_id || null,
    event_id: event_id || null,
    ctx_path,
    diff_content,
    provenance: typeof provenance === 'string' ? provenance : JSON.stringify(provenance),
  });

  return c.json(
    { id: diff.id, status: diff.status, created_at: diff.created_at },
    201,
  );
});

// GET /proposals — list proposals
proposals.get('/proposals', (c) => {
  const db = c.get('db');
  const status = c.req.query('status');
  const ctx_path = c.req.query('ctx_path');
  const limit = c.req.query('limit');
  const offset = c.req.query('offset');

  const result = queryDiffs(db, {
    status: status || undefined,
    ctx_path: ctx_path || undefined,
    limit: limit ? parseInt(limit, 10) : undefined,
    offset: offset ? parseInt(offset, 10) : undefined,
  });

  return c.json({ proposals: result.diffs, total: result.total }, 200);
});

// PATCH /proposals/:id — approve/reject/edit
proposals.patch('/proposals/:id', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');
  const body = await c.req.json();

  const { status, edited_diff } = body;

  if (!status || !['approved', 'rejected'].includes(status)) {
    return c.json(
      {
        error: {
          code: 'BAD_REQUEST',
          message: 'status must be "approved" or "rejected"',
        },
      },
      400,
    );
  }

  const existing = getDiffById(db, id);
  if (!existing) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Proposal not found' } },
      404,
    );
  }

  if (existing.status !== 'proposed') {
    return c.json(
      {
        error: {
          code: 'CONFLICT',
          message: `Cannot change status from "${existing.status}" to "${status}"`,
        },
      },
      409,
    );
  }

  // If edited_diff provided, update the diff content
  if (edited_diff) {
    db.prepare('UPDATE memory_diffs SET diff_content = ? WHERE id = ?').run(
      edited_diff,
      id,
    );
  }

  const updated = updateDiffStatus(db, id, status, 'user');

  return c.json(
    { id: updated!.id, status: updated!.status, resolved_at: updated!.resolved_at },
    200,
  );
});

// POST /proposals/:id/apply — apply an approved proposal
proposals.post('/proposals/:id/apply', async (c) => {
  const db = c.get('db');
  const id = c.req.param('id');

  const diff = getDiffById(db, id);
  if (!diff) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Proposal not found' } },
      404,
    );
  }

  if (diff.status !== 'approved') {
    return c.json(
      {
        error: {
          code: 'CONFLICT',
          message: `Proposal must be "approved" before applying, current status: "${diff.status}"`,
        },
      },
      409,
    );
  }

  // Apply the diff to the .ctx file
  // For now, we use a simple approach: the diff_content is stored as the new content
  // In a production system, this would apply the unified diff patch
  try {
    const audit = insertAuditEntry(db, {
      ctx_path: diff.ctx_path,
      change_type: 'update',
      diff_content: diff.diff_content,
      initiated_by: diff.session_id || 'user',
      reason: `Applied proposal ${diff.id}`,
    });

    // Mark as applied
    updateDiffStatus(db, id, 'applied', 'user');

    return c.json({ id: diff.id, status: 'applied', audit_id: audit.id }, 200);
  } catch (err) {
    return c.json(
      {
        error: {
          code: 'APPLY_FAILED',
          message: (err as Error).message,
        },
      },
      500,
    );
  }
});

export { proposals };
