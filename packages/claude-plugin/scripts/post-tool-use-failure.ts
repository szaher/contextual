/**
 * PostToolUseFailure hook handler (T031)
 *
 * Fires after a tool invocation fails or is interrupted. Logs the failure
 * event to the CtxKit daemon so error patterns can be tracked and surfaced
 * during memory extraction.
 *
 * Input:  HookInputBase + tool_name, tool_input, tool_use_id, error, is_interrupt
 * Output: Always empty — failure hooks never inject context.
 *
 * Timeout: 5 seconds
 */

import type { HookInputBase } from '../src/utils.js';
import {
  runHook,
  getCtxKitEnv,
  createConfiguredClient,
  writeEmptyResponse,
} from '../src/utils.js';

interface PostToolUseFailureInput extends HookInputBase {
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id: string;
  error: string;
  is_interrupt: boolean;
}

const TIMEOUT_MS = 5_000;

runHook<PostToolUseFailureInput>('post-tool-use-failure', async (input) => {
  const { sessionId } = getCtxKitEnv();

  if (!sessionId) {
    console.error('[ctxkit:post-tool-use-failure] No CTXKIT_SESSION_ID — skipping');
    writeEmptyResponse();
    return;
  }

  const client = createConfiguredClient();

  console.error(
    `[ctxkit:post-tool-use-failure] Logging failure tool=${input.tool_name} interrupt=${input.is_interrupt}`,
  );

  await client.logEvent(sessionId, {
    event_type: 'tool_failure',
    tool_name: input.tool_name,
    tool_input: input.tool_input,
    tool_response: {
      error: input.error,
      is_interrupt: input.is_interrupt,
    },
  });

  writeEmptyResponse();
}, TIMEOUT_MS);
