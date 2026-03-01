/**
 * UserPromptSubmit hook handler (T028)
 *
 * Triggered when the user submits a prompt to Claude Code.
 * Responsibilities:
 *   1. Read the CTXKIT_SESSION_ID from environment.
 *   2. Build a context pack from the daemon using the user's prompt text.
 *   3. Return the context pack as additionalContext so the agent sees
 *      relevant repository knowledge alongside the user's request.
 *
 * If no session is active or the daemon is unreachable, the handler
 * returns an empty response (graceful degradation — never block the agent).
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

/** Input schema for the UserPromptSubmit hook. */
interface UserPromptSubmitInput extends HookInputBase {
  prompt: string;
}

/** Shape of the context pack returned by the daemon. */
interface ContextPack {
  pack_id: string;
  token_estimate: number;
  inject_text: string;
}

runHook<UserPromptSubmitInput>('UserPromptSubmit', async (input) => {
  const { sessionId } = getCtxKitEnv();

  // If no session was established, skip context injection
  if (!sessionId) {
    console.error('[ctxkit:UserPromptSubmit] No active session — skipping');
    writeEmptyResponse();
    return;
  }

  const { cwd, prompt } = input;

  // Build context pack from the daemon
  const client = await createConfiguredClient();
  const pack = (await client.buildContextPack({
    session_id: sessionId,
    request_text: prompt,
    working_dir: cwd,
  })) as ContextPack;

  console.error(
    `[ctxkit:UserPromptSubmit] Context pack ${pack.pack_id}: ${pack.token_estimate} tokens`,
  );

  // Format context pack with header
  const contextText = `[CtxKit Pack: ${pack.pack_id} | ${pack.token_estimate} tokens]\n${pack.inject_text}`;

  writeStdoutJson({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: contextText,
    },
  });
}, 5_000);
