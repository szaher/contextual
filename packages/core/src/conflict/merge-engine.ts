import type { CtxFile, KeyFile, Contract, Decision, Gotcha, CtxRef } from '../types/ctx.js';
import type { ConflictEntry, MergeResult, MergeStrategy } from '../types/conflict.js';

/**
 * Perform a three-way merge of two CtxFile versions against a common base.
 * Uses per-section merge strategies defined in SECTION_MERGE_STRATEGIES.
 *
 * @param base - The common ancestor version
 * @param ours - Our version (changes from base)
 * @param theirs - Their version (changes from base)
 * @returns MergeResult with merged content, conflicts, and strategy log
 */
export function threeWayMerge(base: CtxFile, ours: CtxFile, theirs: CtxFile): MergeResult {
  const conflicts: ConflictEntry[] = [];
  const strategies: Array<{ section: string; strategy: MergeStrategy }> = [];

  // Merge each section according to its strategy
  const mergedKeyFiles = mergeUnionByKey(
    base.key_files, ours.key_files, theirs.key_files,
    'path', 'key_files', conflicts, ours, theirs,
  );
  strategies.push({ section: 'key_files', strategy: 'union-by-key' });

  const mergedContracts = mergeUnionByKey(
    base.contracts, ours.contracts, theirs.contracts,
    'name', 'contracts', conflicts, ours, theirs,
  );
  strategies.push({ section: 'contracts', strategy: 'union-by-key' });

  const mergedDecisions = mergeUnionByKey(
    base.decisions, ours.decisions, theirs.decisions,
    'id', 'decisions', conflicts, ours, theirs,
  );
  strategies.push({ section: 'decisions', strategy: 'union-by-key' });

  const mergedRefs = mergeUnionByKey(
    base.refs, ours.refs, theirs.refs,
    'target', 'refs', conflicts, ours, theirs,
  );
  strategies.push({ section: 'refs', strategy: 'union-by-key' });

  // Last-writer-wins for summary and commands
  const mergedSummary = mergeLastWriterWins(
    base.summary, ours.summary, theirs.summary,
  );
  strategies.push({ section: 'summary', strategy: 'last-writer-wins' });

  const mergedCommands = mergeLastWriterWinsObject(
    base.commands, ours.commands, theirs.commands,
  );
  strategies.push({ section: 'commands', strategy: 'last-writer-wins' });

  // Concatenate-dedup for gotchas
  const mergedGotchas = mergeConcatenateDedup(
    base.gotchas, ours.gotchas, theirs.gotchas,
  );
  strategies.push({ section: 'gotchas', strategy: 'concatenate-dedup' });

  // Deduplicated-union for tags and ignore
  const mergedTags = mergeDeduplicatedUnion(base.tags, ours.tags, theirs.tags);
  strategies.push({ section: 'tags', strategy: 'deduplicated-union' });

  const mergedIgnore = {
    never_read: mergeDeduplicatedUnion(
      base.ignore.never_read, ours.ignore.never_read, theirs.ignore.never_read,
    ),
    never_log: mergeDeduplicatedUnion(
      base.ignore.never_log, ours.ignore.never_log, theirs.ignore.never_log,
    ),
  };
  strategies.push({ section: 'ignore', strategy: 'deduplicated-union' });

  // Use the higher version
  const mergedVersion = Math.max(ours.version, theirs.version);

  // Merge _history: combine, deduplicate by version, sort newest first
  const mergedHistory = mergeHistories(ours._history ?? [], theirs._history ?? []);

  const merged: CtxFile = {
    version: mergedVersion,
    summary: mergedSummary,
    key_files: mergedKeyFiles as KeyFile[],
    contracts: mergedContracts as Contract[],
    decisions: mergedDecisions as Decision[],
    commands: mergedCommands,
    gotchas: mergedGotchas as Gotcha[],
    tags: mergedTags,
    refs: mergedRefs as CtxRef[],
    ignore: mergedIgnore,
    _history: mergedHistory.length > 0 ? mergedHistory : undefined,
  };

  return {
    clean: conflicts.length === 0,
    merged,
    conflicts,
    strategies,
  };
}

/**
 * Union-by-key merge: merge arrays of objects using a key field.
 * - Items only in ours or theirs → added
 * - Items in both with same content → kept
 * - Items in both with different content → conflict
 * - Items removed from base in one side but modified in the other → conflict
 */
function mergeUnionByKey<T extends object>(
  baseArr: T[],
  oursArr: T[],
  theirsArr: T[],
  keyField: string,
  sectionName: string,
  conflicts: ConflictEntry[],
  oursCtx: CtxFile,
  theirsCtx: CtxFile,
): T[] {
  const getKey = (item: T) => (item as Record<string, unknown>)[keyField] as string;
  const baseMap = new Map(baseArr.map((item) => [getKey(item), item]));
  const oursMap = new Map(oursArr.map((item) => [getKey(item), item]));
  const theirsMap = new Map(theirsArr.map((item) => [getKey(item), item]));

  const allKeys = new Set([...oursMap.keys(), ...theirsMap.keys()]);
  const result: T[] = [];

  for (const key of allKeys) {
    const inBase = baseMap.has(key);
    const inOurs = oursMap.has(key);
    const inTheirs = theirsMap.has(key);
    const oursItem = oursMap.get(key);
    const theirsItem = theirsMap.get(key);
    const baseItem = baseMap.get(key);

    if (inOurs && inTheirs) {
      // Both have it — check if same
      if (deepEqual(oursItem, theirsItem)) {
        result.push(oursItem!);
      } else if (inBase && deepEqual(baseItem, oursItem)) {
        // Ours unchanged from base, theirs changed → take theirs
        result.push(theirsItem!);
      } else if (inBase && deepEqual(baseItem, theirsItem)) {
        // Theirs unchanged from base, ours changed → take ours
        result.push(oursItem!);
      } else {
        // Both modified differently from base → conflict
        conflicts.push({
          section: sectionName,
          key,
          ours: oursItem,
          theirs: theirsItem,
          ours_author: getLastAuthor(oursCtx),
          theirs_author: getLastAuthor(theirsCtx),
        });
        // Include ours as the default in merged output
        result.push(oursItem!);
      }
    } else if (inOurs && !inTheirs) {
      if (inBase) {
        // Was in base, ours kept it, theirs removed it
        // If ours modified it from base → conflict (concurrent modify + delete)
        if (!deepEqual(baseItem, oursItem)) {
          conflicts.push({
            section: sectionName,
            key,
            ours: oursItem,
            theirs: null,
            ours_author: getLastAuthor(oursCtx),
            theirs_author: getLastAuthor(theirsCtx),
          });
        }
        // If ours is same as base, theirs deletion wins → omit
        // But if ours modified, include ours (conflict recorded above)
        if (!deepEqual(baseItem, oursItem)) {
          result.push(oursItem!);
        }
      } else {
        // Not in base, only in ours → added by ours
        result.push(oursItem!);
      }
    } else if (!inOurs && inTheirs) {
      if (inBase) {
        // Was in base, theirs kept it, ours removed it
        if (!deepEqual(baseItem, theirsItem)) {
          conflicts.push({
            section: sectionName,
            key,
            ours: null,
            theirs: theirsItem,
            ours_author: getLastAuthor(oursCtx),
            theirs_author: getLastAuthor(theirsCtx),
          });
          result.push(theirsItem!);
        }
        // If theirs is same as base, ours deletion wins → omit
      } else {
        // Not in base, only in theirs → added by theirs
        result.push(theirsItem!);
      }
    }
  }

  return result;
}

/**
 * Last-writer-wins for scalar values.
 * If both changed from base, the one with the later change wins (theirs preferred).
 */
function mergeLastWriterWins<T>(base: T, ours: T, theirs: T): T {
  if (deepEqual(ours, theirs)) return ours;
  if (deepEqual(base, ours)) return theirs; // Only theirs changed
  if (deepEqual(base, theirs)) return ours; // Only ours changed
  // Both changed — last writer wins (theirs preferred as it's the later write)
  return theirs;
}

/**
 * Last-writer-wins for Record objects — merge at the key level.
 */
function mergeLastWriterWinsObject(
  base: Record<string, string>,
  ours: Record<string, string>,
  theirs: Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = { ...ours };

  for (const [key, value] of Object.entries(theirs)) {
    if (!(key in base)) {
      // New key from theirs
      result[key] = value;
    } else if (key in ours) {
      // Both have it
      if (ours[key] !== theirs[key]) {
        if (base[key] === ours[key]) {
          // Only theirs changed
          result[key] = value;
        }
        // If both changed, ours wins (already in result)
      }
    } else {
      // Ours removed it, theirs still has it — theirs wins if modified from base
      if (base[key] !== value) {
        result[key] = value;
      }
    }
  }

  return result;
}

/**
 * Concatenate-dedup: add all gotchas from both sides, deduplicate by text.
 */
function mergeConcatenateDedup<T extends { text: string }>(
  base: T[],
  ours: T[],
  theirs: T[],
): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  // Add ours first
  for (const item of ours) {
    if (!seen.has(item.text)) {
      seen.add(item.text);
      result.push(item);
    }
  }

  // Then add theirs (only new ones)
  for (const item of theirs) {
    if (!seen.has(item.text)) {
      seen.add(item.text);
      result.push(item);
    }
  }

  return result;
}

/**
 * Deduplicated-union: union of string arrays, deduplicating.
 */
function mergeDeduplicatedUnion(base: string[], ours: string[], theirs: string[]): string[] {
  const oursSet = new Set(ours);
  const theirsSet = new Set(theirs);

  const result = new Set<string>();

  // Add everything from ours and theirs
  for (const item of ours) result.add(item);
  for (const item of theirs) result.add(item);

  // If an item was in base but removed by both sides, remove it
  for (const item of base) {
    if (!oursSet.has(item) && !theirsSet.has(item)) {
      result.delete(item);
    }
    // If removed by one side but not the other, keep it (the side that kept it wins)
  }

  return [...result];
}

/**
 * Merge _history arrays: combine both, deduplicate by version number, sort newest first.
 */
function mergeHistories(
  oursHistory: Array<{ version: number; timestamp: string; author: string; session_id: string | null; reason: string; checksum: string; diff_summary: string }>,
  theirsHistory: Array<{ version: number; timestamp: string; author: string; session_id: string | null; reason: string; checksum: string; diff_summary: string }>,
) {
  const byVersion = new Map<number, typeof oursHistory[0]>();

  for (const entry of oursHistory) {
    byVersion.set(entry.version, entry);
  }
  for (const entry of theirsHistory) {
    if (!byVersion.has(entry.version)) {
      byVersion.set(entry.version, entry);
    }
  }

  return [...byVersion.values()].sort((a, b) => b.version - a.version);
}

/**
 * Get the last author from a CtxFile's _history.
 */
function getLastAuthor(ctx: CtxFile): string {
  if (ctx._history && ctx._history.length > 0) {
    return ctx._history[0].author;
  }
  return 'unknown';
}

/**
 * Deep equality check for objects/arrays.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
