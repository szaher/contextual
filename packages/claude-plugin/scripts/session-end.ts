/**
 * SessionEnd hook handler (T027)
 *
 * Triggered when a Claude Code session ends (clear, logout, exit, etc.).
 * Responsibilities:
 *   1. Read the CTXKIT_SESSION_ID from environment (set during SessionStart).
 *   2. Close the CtxKit session on the daemon.
 *   3. Return an empty response — no context injection needed at session end.
 *
 * If no session ID is present (e.g. non-git directory, daemon never started),
 * the handler returns an empty response without error.
 *
 * This is a stdio-based process: all logging goes to stderr, structured
 * output goes to stdout via writeStdoutJson().
 */

import {
  runHook,
  getCtxKitEnv,
  createConfiguredClient,
  writeEmptyResponse,
  type HookInputBase,
} from '../src/utils.js';

/** Input schema for the SessionEnd hook. */
interface SessionEndInput extends HookInputBase {
  reason:
    | 'clear'
    | 'logout'
    | 'prompt_input_exit'
    | 'bypass_permissions_disabled'
    | 'other';
}

runHook<SessionEndInput>('SessionEnd', async (input) => {
  const { sessionId } = getCtxKitEnv();

  // If no session was established, nothing to close
  if (!sessionId) {
    console.error('[ctxkit:SessionEnd] No active session — skipping');
    writeEmptyResponse();
    return;
  }

  console.error(
    `[ctxkit:SessionEnd] Closing session ${sessionId} (reason=${input.reason})`,
  );

  // Create daemon client and close the session
  const client = await createConfiguredClient();

  // Step 1: Record final activity events (stale dirs, proposals generated)
  try {
    const activityData = await client.get<{ events?: Array<{ event_type: string }> }>(`/api/v1/activity?session_id=${sessionId}&limit=500`);
    const events = activityData.events || [];
    const fileModifiedCount = events.filter((e) => e.event_type === 'FILE_MODIFIED').length;
    const proposalCount = events.filter((e) => e.event_type === 'PROPOSAL_CREATED').length;

    // Record session summary activity event
    await client.post('/api/v1/activity', {
      session_id: sessionId,
      event_type: 'SESSION_SUMMARY',
      data: {
        reason: input.reason,
        total_file_modifications: fileModifiedCount,
        total_proposals: proposalCount,
      },
    });
    console.error(`[ctxkit:SessionEnd] Recorded session summary: ${fileModifiedCount} file mods, ${proposalCount} proposals`);
  } catch (err) {
    // Non-blocking — don't fail the hook
    console.error('[ctxkit:SessionEnd] Failed to record final activity:', err);
  }

  // Step 2: Close the session
  await client.closeSession(sessionId);

  console.error(`[ctxkit:SessionEnd] Session ${sessionId} closed`);
  writeEmptyResponse();
}, 10_000);
