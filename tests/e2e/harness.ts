import { buildContextPack } from '@ctxl/core';
import type { ContextPack } from '@ctxl/core';

export interface RecordedSession {
  id: string;
  repo_path: string;
  working_dir: string;
  requests: RecordedRequest[];
}

export interface RecordedRequest {
  request_text: string;
  budget_tokens: number;
  expected_pack?: ContextPack;
}

export interface ReplayResult {
  request_text: string;
  passed: boolean;
  actual_pack: ContextPack;
  expected_pack?: ContextPack;
  mismatches: string[];
}

export interface HarnessReport {
  total: number;
  passed: number;
  failed: number;
  results: ReplayResult[];
}

/**
 * Record a session by building context packs for each request.
 */
export function recordSession(
  repoRoot: string,
  workingDir: string,
  requests: Array<{ request_text: string; budget_tokens: number }>,
): RecordedSession {
  const recorded: RecordedSession = {
    id: `session_${Date.now()}`,
    repo_path: repoRoot,
    working_dir: workingDir,
    requests: requests.map((req) => {
      const result = buildContextPack({
        workingDir,
        repoRoot,
        requestText: req.request_text,
        budgetTokens: req.budget_tokens,
      });
      return {
        request_text: req.request_text,
        budget_tokens: req.budget_tokens,
        expected_pack: result.pack,
      };
    }),
  };
  return recorded;
}

/**
 * Replay a recorded session and compare results.
 */
export function replaySession(session: RecordedSession): HarnessReport {
  const results: ReplayResult[] = [];

  for (const req of session.requests) {
    const result = buildContextPack({
      workingDir: session.working_dir,
      repoRoot: session.repo_path,
      requestText: req.request_text,
      budgetTokens: req.budget_tokens,
    });

    const mismatches = compareContextPacks(req.expected_pack, result.pack);

    results.push({
      request_text: req.request_text,
      passed: mismatches.length === 0,
      actual_pack: result.pack,
      expected_pack: req.expected_pack,
      mismatches,
    });
  }

  return {
    total: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    results,
  };
}

/**
 * Compare two context packs and return list of mismatches.
 */
export function compareContextPacks(
  expected: ContextPack | undefined,
  actual: ContextPack,
): string[] {
  if (!expected) return [];

  const mismatches: string[] = [];

  // Check item count
  if (expected.items.length !== actual.items.length) {
    mismatches.push(
      `Item count mismatch: expected ${expected.items.length}, got ${actual.items.length}`,
    );
  }

  // Check total tokens
  if (expected.total_tokens !== actual.total_tokens) {
    mismatches.push(
      `Token count mismatch: expected ${expected.total_tokens}, got ${actual.total_tokens}`,
    );
  }

  // Check budget adherence
  if (actual.total_tokens > actual.budget_tokens) {
    mismatches.push(
      `Budget exceeded: ${actual.total_tokens} > ${actual.budget_tokens}`,
    );
  }

  // Check item ordering (deterministic)
  const minLen = Math.min(expected.items.length, actual.items.length);
  for (let i = 0; i < minLen; i++) {
    const exp = expected.items[i];
    const act = actual.items[i];
    if (exp.entry_id !== act.entry_id) {
      mismatches.push(
        `Item ${i} entry_id mismatch: expected "${exp.entry_id}", got "${act.entry_id}"`,
      );
    }
    if (exp.source !== act.source) {
      mismatches.push(
        `Item ${i} source mismatch: expected "${exp.source}", got "${act.source}"`,
      );
    }
    // Check reason codes
    const expReasons = [...exp.reason_codes].sort().join(',');
    const actReasons = [...act.reason_codes].sort().join(',');
    if (expReasons !== actReasons) {
      mismatches.push(
        `Item ${i} reason codes mismatch: expected [${expReasons}], got [${actReasons}]`,
      );
    }
  }

  // Check omitted count
  if (expected.omitted.length !== actual.omitted.length) {
    mismatches.push(
      `Omitted count mismatch: expected ${expected.omitted.length}, got ${actual.omitted.length}`,
    );
  }

  return mismatches;
}
