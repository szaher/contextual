/**
 * PreToolUse hook handler (T029)
 *
 * Triggered before Claude Code executes a tool (Bash, Edit, Write, etc.).
 * Responsibilities:
 *   1. Read the CTXKIT_SESSION_ID from environment.
 *   2. Build a small context pack (budget_tokens=2000) scoped to the
 *      specific tool invocation (tool name + tool input).
 *   3. If the pack contains relevant items, return them as additionalContext
 *      so the agent has last-mile context before executing the tool.
 *   4. If the pack is empty, return an empty response.
 *
 * Uses a tight 5s timeout to avoid slowing down tool execution.
 *
 * This is a stdio-based process: all logging goes to stderr, structured
 * output goes to stdout via writeStdoutJson().
 */

import {
  runHook,
  getCtxKitEnv,
  createConfiguredClient,
  writeStdoutJson,
  writeEmptyResponse,
  type HookInputBase,
} from '../src/utils.js';

/** Input schema for the PreToolUse hook. */
interface PreToolUseInput extends HookInputBase {
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id: string;
}

/** Shape of the context pack returned by the daemon. */
interface ContextPack {
  pack_id: string;
  token_estimate: number;
  inject_text: string;
  items?: unknown[];
}

runHook<PreToolUseInput>('PreToolUse', async (input) => {
  const { sessionId } = getCtxKitEnv();

  // If no session was established, skip context injection
  if (!sessionId) {
    console.error('[ctxkit:PreToolUse] No active session — skipping');
    writeEmptyResponse();
    return;
  }

  const { cwd, tool_name, tool_input } = input;

  // Build a small context pack scoped to this tool invocation
  const client = createConfiguredClient();
  const pack = (await client.buildContextPack({
    session_id: sessionId,
    request_text: tool_name + ' ' + JSON.stringify(tool_input),
    working_dir: cwd,
    budget_tokens: 2000,
  })) as ContextPack;

  // Only inject context if the pack has items
  const hasItems =
    pack.items && Array.isArray(pack.items) && pack.items.length > 0;
  if (!hasItems || !pack.inject_text) {
    console.error(
      `[ctxkit:PreToolUse] No relevant context for tool ${tool_name}`,
    );
    writeEmptyResponse();
    return;
  }

  console.error(
    `[ctxkit:PreToolUse] Context pack ${pack.pack_id}: ${pack.token_estimate} tokens for ${tool_name}`,
  );

  // Format context pack with header
  const contextText = `[CtxKit Pack: ${pack.pack_id} | ${pack.token_estimate} tokens]\n${pack.inject_text}`;

  writeStdoutJson({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: contextText,
    },
  });
}, 5_000);
