import type { CtxFile } from '../types/ctx.js';
import type { HistoryEntry } from '../types/history.js';
import { computeChecksum } from '../index/checksum.js';

export interface BumpOptions {
  /** Who made the change (agent:<model-id> or developer:<username>) */
  author: string;
  /** Why the change was made (max 200 chars) */
  reason: string;
  /** Agent session ID (null for developer edits) */
  session_id?: string | null;
  /** Pre-computed diff summary. If not provided, will be empty. */
  diff_summary?: string;
}

/**
 * Increment the version of a .ctx file and prepend a new HistoryEntry.
 * Returns the updated CtxFile with the new version and history entry.
 */
export function bumpVersion(ctx: CtxFile, options: BumpOptions): CtxFile {
  const newVersion = ctx.version + 1;
  const checksum = computeChecksum(ctx);

  const entry: HistoryEntry = {
    version: newVersion,
    timestamp: new Date().toISOString(),
    author: options.author,
    session_id: options.session_id ?? null,
    reason: options.reason.slice(0, 200),
    checksum,
    diff_summary: options.diff_summary ?? '',
  };

  // Prepend to _history (newest first)
  const history = [entry, ...(ctx._history ?? [])];

  return {
    ...ctx,
    version: newVersion,
    _history: history,
  };
}

/**
 * Generate a diff_summary string from comparing two CtxFile objects.
 * Format: "+N section, ~N section, -N section"
 */
export function generateDiffSummary(before: CtxFile, after: CtxFile): string {
  const parts: string[] = [];

  // key_files
  const beforePaths = new Set(before.key_files.map((kf) => kf.path));
  const afterPaths = new Set(after.key_files.map((kf) => kf.path));
  const addedKf = [...afterPaths].filter((p) => !beforePaths.has(p)).length;
  const removedKf = [...beforePaths].filter((p) => !afterPaths.has(p)).length;
  const modifiedKf = [...afterPaths].filter((p) => beforePaths.has(p)).filter((p) => {
    const b = before.key_files.find((kf) => kf.path === p);
    const a = after.key_files.find((kf) => kf.path === p);
    return JSON.stringify(b) !== JSON.stringify(a);
  }).length;
  if (addedKf > 0) parts.push(`+${addedKf} key_files`);
  if (modifiedKf > 0) parts.push(`~${modifiedKf} key_files`);
  if (removedKf > 0) parts.push(`-${removedKf} key_files`);

  // contracts
  const beforeContracts = new Set(before.contracts.map((c) => c.name));
  const afterContracts = new Set(after.contracts.map((c) => c.name));
  const addedC = [...afterContracts].filter((n) => !beforeContracts.has(n)).length;
  const removedC = [...beforeContracts].filter((n) => !afterContracts.has(n)).length;
  if (addedC > 0) parts.push(`+${addedC} contracts`);
  if (removedC > 0) parts.push(`-${removedC} contracts`);

  // decisions
  const beforeDecisions = new Set(before.decisions.map((d) => d.id));
  const afterDecisions = new Set(after.decisions.map((d) => d.id));
  const addedD = [...afterDecisions].filter((id) => !beforeDecisions.has(id)).length;
  const removedD = [...beforeDecisions].filter((id) => !afterDecisions.has(id)).length;
  if (addedD > 0) parts.push(`+${addedD} decisions`);
  if (removedD > 0) parts.push(`-${removedD} decisions`);

  // gotchas
  const gotchaDiff = after.gotchas.length - before.gotchas.length;
  if (gotchaDiff > 0) parts.push(`+${gotchaDiff} gotchas`);
  if (gotchaDiff < 0) parts.push(`${gotchaDiff} gotchas`);

  // tags
  const beforeTags = new Set(before.tags);
  const afterTags = new Set(after.tags);
  const addedT = [...afterTags].filter((t) => !beforeTags.has(t)).length;
  const removedT = [...beforeTags].filter((t) => !afterTags.has(t)).length;
  if (addedT > 0) parts.push(`+${addedT} tags`);
  if (removedT > 0) parts.push(`-${removedT} tags`);

  // summary
  if (before.summary !== after.summary) parts.push('~1 summary');

  return parts.join(', ') || 'no changes';
}
