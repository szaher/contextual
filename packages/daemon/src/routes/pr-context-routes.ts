import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import { listSessions, getSessionById } from '../store/sessions.js';
import { getToolEventsBySession } from '../store/events.js';
import { collectPrContext, renderPrMarkdown, renderPrJson } from '@ctxkit/core';
import type { SessionData } from '@ctxkit/core';

export const prContextRoutes = new Hono<AppEnv>();

// POST /pr-context/generate — generate a PR context document
prContextRoutes.post('/pr-context/generate', async (c) => {
  const body = await c.req.json();
  const { repo_root, session_ids, git_range, format, link_specs } = body;

  if (!repo_root) {
    return c.json({ error: { code: 'BAD_REQUEST', message: 'repo_root is required' } }, 400);
  }

  const db = c.get('db');
  const sessions: SessionData[] = [];

  if (session_ids && session_ids.length > 0) {
    // Fetch specific sessions
    for (const id of session_ids) {
      const session = getSessionById(db, id);
      if (session) {
        const toolEvents = getToolEventsBySession(db, id);
        sessions.push({
          id: session.id,
          repo_path: session.repo_path,
          branch: session.branch,
          agent_id: session.agent_id,
          started_at: session.started_at,
          ended_at: session.ended_at,
          events: session.events.map((e) => ({
            id: e.id,
            request_text: e.request_text,
            token_count: e.token_count,
            created_at: e.created_at,
            context_pack: null,
          })),
          tool_events: toolEvents.map((te) => ({
            tool_name: te.tool_name,
            tool_input: te.tool_input,
            tool_response: te.tool_response,
            event_type: te.event_type,
            duration_ms: te.duration_ms,
            created_at: te.created_at,
          })),
        });
      }
    }
  } else {
    // Get all sessions for repo
    const result = listSessions(db, { repo_path: repo_root, limit: 50 });
    for (const s of result.sessions) {
      const detail = getSessionById(db, s.id);
      if (detail) {
        const toolEvents = getToolEventsBySession(db, s.id);
        sessions.push({
          id: detail.id,
          repo_path: detail.repo_path,
          branch: detail.branch,
          agent_id: detail.agent_id,
          started_at: detail.started_at,
          ended_at: detail.ended_at,
          events: detail.events.map((e) => ({
            id: e.id,
            request_text: e.request_text,
            token_count: e.token_count,
            created_at: e.created_at,
            context_pack: null,
          })),
          tool_events: toolEvents.map((te) => ({
            tool_name: te.tool_name,
            tool_input: te.tool_input,
            tool_response: te.tool_response,
            event_type: te.event_type,
            duration_ms: te.duration_ms,
            created_at: te.created_at,
          })),
        });
      }
    }
  }

  if (sessions.length === 0) {
    return c.json({ format: format || 'markdown', content: '', stats: {} });
  }

  const prContext = collectPrContext(sessions, {
    repoRoot: repo_root,
    gitRange: git_range,
    linkSpecs: !!link_specs,
  });

  const outputFormat = format || 'markdown';
  const content = outputFormat === 'json' ? renderPrJson(prContext) : renderPrMarkdown(prContext);

  return c.json({
    format: outputFormat,
    content,
    stats: prContext.stats,
  });
});
