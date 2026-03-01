/**
 * TaskCompleted hook handler (T032)
 *
 * Fires when a task finishes. Triggers a CtxKit proposal that distills
 * session learnings into a .ctx update. The proposal summary is returned
 * as additionalContext so the agent can inform the user.
 *
 * Input:  HookInputBase + task_id, task_subject, task_description
 * Output: additionalContext with proposal summary, or empty on failure.
 *
 * Timeout: 10 seconds (proposals may involve LLM summarization)
 */

import type { HookInputBase } from '../src/utils.js';
import {
  runHook,
  getCtxKitEnv,
  createConfiguredClient,
  writeEmptyResponse,
  writeStdoutJson,
} from '../src/utils.js';

interface TaskCompletedInput extends HookInputBase {
  task_id: string;
  task_subject: string;
  task_description: string;
}

const TIMEOUT_MS = 10_000;

runHook<TaskCompletedInput>('task-completed', async (input) => {
  const { sessionId } = getCtxKitEnv();

  if (!sessionId) {
    console.error('[ctxkit:task-completed] No CTXKIT_SESSION_ID — skipping');
    writeEmptyResponse();
    return;
  }

  const client = createConfiguredClient();

  console.error(
    `[ctxkit:task-completed] Creating proposal for task=${input.task_id}`,
  );

  try {
    const proposal = await client.createProposal({
      session_id: sessionId,
      scope: 'cwd',
      provenance: {
        task_id: input.task_id,
        task_subject: input.task_subject,
      },
    });

    const proposalText = [
      `[CtxKit Proposal: ${proposal.id}]`,
      `Summary: ${proposal.summary}`,
      `Review: /ctxkit apply ${proposal.id}`,
    ].join('\n');

    console.error(
      `[ctxkit:task-completed] Proposal created: ${proposal.id}`,
    );

    writeStdoutJson({
      hookSpecificOutput: {
        hookEventName: 'TaskCompleted',
        additionalContext: proposalText,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[ctxkit:task-completed] Proposal failed (non-blocking): ${message}`,
    );
    writeEmptyResponse();
  }
}, TIMEOUT_MS);
