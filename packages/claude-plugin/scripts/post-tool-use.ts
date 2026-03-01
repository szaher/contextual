/**
 * PostToolUse hook handler (T030)
 *
 * Fires after every successful tool invocation. Logs the tool usage event
 * to the CtxKit daemon for session analytics and memory extraction.
 *
 * Input:  HookInputBase + tool_name, tool_input, tool_response, tool_use_id
 * Output: Always empty — post-tool hooks never inject context.
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

interface PostToolUseInput extends HookInputBase {
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_response: Record<string, unknown>;
  tool_use_id: string;
}

const TIMEOUT_MS = 5_000;

runHook<PostToolUseInput>('post-tool-use', async (input) => {
  const { sessionId } = getCtxKitEnv();

  if (!sessionId) {
    console.error('[ctxkit:post-tool-use] No CTXKIT_SESSION_ID — skipping');
    writeEmptyResponse();
    return;
  }

  const client = createConfiguredClient();

  // Extract file paths from tool_input (common fields used by various tools)
  const filePaths: string[] = [];
  for (const key of ['file_path', 'pattern', 'path'] as const) {
    const value = input.tool_input[key];
    if (typeof value === 'string' && value.length > 0) {
      filePaths.push(value);
    }
  }

  // Extract exit_code from tool_response if present (e.g. Bash tool)
  let exitCode: number | undefined;
  if (
    'exit_code' in input.tool_response &&
    typeof input.tool_response.exit_code === 'number'
  ) {
    exitCode = input.tool_response.exit_code;
  }

  console.error(
    `[ctxkit:post-tool-use] Logging tool=${input.tool_name} files=${filePaths.length} exit_code=${exitCode ?? 'n/a'}`,
  );

  await client.logEvent(sessionId, {
    event_type: 'tool_success',
    tool_name: input.tool_name,
    tool_input: input.tool_input,
    tool_response: input.tool_response,
    exit_code: exitCode,
    duration_ms: undefined,
  });

  writeEmptyResponse();
}, TIMEOUT_MS);
