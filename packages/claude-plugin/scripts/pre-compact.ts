/**
 * PreCompact hook handler (T033)
 *
 * Fires before conversation compaction (manual or auto). Injects a
 * "compaction spine" into the compacted context so that the agent retains
 * awareness of the active CtxKit session, pending proposals, and key
 * .ctx file locations after the transcript is compressed.
 *
 * Input:  HookInputBase + trigger, custom_instructions
 * Output: additionalContext with the compaction spine text.
 *
 * Timeout: 5 seconds
 */

import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { HookInputBase } from '../src/utils.js';
import {
  runHook,
  getCtxKitEnv,
  createConfiguredClient,
  writeEmptyResponse,
  writeStdoutJson,
} from '../src/utils.js';

interface PreCompactInput extends HookInputBase {
  trigger: 'manual' | 'auto';
  custom_instructions: string;
}

interface ProposalEntry {
  id: string;
  ctx_path?: string;
  [key: string]: unknown;
}

const TIMEOUT_MS = 5_000;

/**
 * Walk upward from cwd looking for .ctx directories.
 * Returns all unique .ctx paths found between cwd and the filesystem root
 * (stops after 10 levels to avoid excessive traversal).
 */
function findCtxPaths(cwd: string): string[] {
  const found: string[] = [];
  let current = cwd;
  const maxDepth = 10;

  for (let i = 0; i < maxDepth; i++) {
    const ctxPath = join(current, '.ctx');
    if (existsSync(ctxPath)) {
      found.push(ctxPath);
    }

    const parent = dirname(current);
    if (parent === current) {
      // Reached filesystem root
      break;
    }
    current = parent;
  }

  return found;
}

runHook<PreCompactInput>('pre-compact', async (input) => {
  const { sessionId, apiUrl, repoRoot } = getCtxKitEnv();

  if (!sessionId) {
    console.error('[ctxkit:pre-compact] No CTXKIT_SESSION_ID — skipping');
    writeEmptyResponse();
    return;
  }

  const client = createConfiguredClient();

  console.error(
    `[ctxkit:pre-compact] Building compaction spine trigger=${input.trigger}`,
  );

  // Fetch active proposals (graceful — never block compaction)
  let proposalsText = 'none';
  try {
    const result = await client.listProposals({ status: 'proposed' });
    const proposals = result.proposals as ProposalEntry[];

    if (proposals.length > 0) {
      proposalsText = proposals
        .map((p) => `${p.id} (${p.ctx_path ?? 'unknown'})`)
        .join(', ');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `[ctxkit:pre-compact] Failed to fetch proposals (non-blocking): ${message}`,
    );
  }

  // Detect .ctx directories from cwd upward
  const ctxPaths = findCtxPaths(input.cwd);
  const ctxPathsText = ctxPaths.length > 0 ? ctxPaths.join(', ') : 'none found';

  // Build the compaction spine
  const spine = [
    '[CtxKit Compaction Spine]',
    `Session: ${sessionId} | API: ${apiUrl ?? 'default'} | Root: ${repoRoot ?? 'unknown'}`,
    `Active proposals: ${proposalsText}`,
    `Key .ctx: ${ctxPathsText}`,
  ].join('\n');

  console.error('[ctxkit:pre-compact] Spine built successfully');

  writeStdoutJson({
    hookSpecificOutput: {
      hookEventName: 'PreCompact',
      additionalContext: spine,
    },
  });
}, TIMEOUT_MS);
