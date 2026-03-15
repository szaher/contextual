import type { CtxFile } from '../types/ctx.js';
import type { ConflictEntry, ResolutionRequest } from '../types/conflict.js';
import { bumpVersion } from '../versioning/bumper.js';

/**
 * Apply a resolution choice to a conflicting entry in a .ctx file.
 * Returns the updated CtxFile with the conflict resolved and version bumped.
 *
 * @param ctx - The CtxFile with conflicts
 * @param conflicts - Current list of conflicts
 * @param request - The resolution request
 * @returns Updated CtxFile and remaining conflicts
 */
export function resolveConflict(
  ctx: CtxFile,
  conflicts: ConflictEntry[],
  request: ResolutionRequest,
): { ctx: CtxFile; remainingConflicts: ConflictEntry[] } {
  const conflict = conflicts.find(
    (c) => c.section === request.section && c.key === request.key,
  );

  if (!conflict) {
    throw new Error(
      `No conflict found for section "${request.section}", key "${request.key}"`,
    );
  }

  let updated = { ...ctx };

  switch (request.choice) {
    case 'pick_ours':
      updated = applyResolution(updated, conflict, conflict.ours);
      break;
    case 'pick_theirs':
      updated = applyResolution(updated, conflict, conflict.theirs);
      break;
    case 'keep_both':
      updated = applyKeepBoth(updated, conflict);
      break;
    case 'manual':
      if (request.manual_content === undefined) {
        throw new Error('manual_content is required when choice is "manual"');
      }
      updated = applyResolution(updated, conflict, request.manual_content);
      break;
  }

  // Bump version with resolution metadata
  const resolved = bumpVersion(updated, {
    author: request.author,
    reason: `Resolved conflict in ${request.section}[${request.key}]: ${request.choice}`,
  });

  const remainingConflicts = conflicts.filter(
    (c) => !(c.section === request.section && c.key === request.key),
  );

  return { ctx: resolved, remainingConflicts };
}

/**
 * Resolve all conflicts in a .ctx file with a single strategy.
 */
export function resolveAllConflicts(
  ctx: CtxFile,
  conflicts: ConflictEntry[],
  choice: 'pick_ours' | 'pick_theirs',
  author: string,
): CtxFile {
  let updated = { ...ctx };

  for (const conflict of conflicts) {
    const value = choice === 'pick_ours' ? conflict.ours : conflict.theirs;
    updated = applyResolution(updated, conflict, value);
  }

  return bumpVersion(updated, {
    author,
    reason: `Resolved ${conflicts.length} conflicts: ${choice}`,
  });
}

/**
 * Extract conflict entries from a CtxFile that has _conflict markers.
 */
export function extractConflicts(ctx: CtxFile): ConflictEntry[] {
  const conflicts: ConflictEntry[] = [];

  // Check key_files for _conflict markers
  for (const kf of ctx.key_files) {
    const record = kf as unknown as Record<string, unknown>;
    if (record._conflict) {
      conflicts.push(record._conflict as ConflictEntry);
    }
  }

  // Check contracts
  for (const contract of ctx.contracts) {
    const record = contract as unknown as Record<string, unknown>;
    if (record._conflict) {
      conflicts.push(record._conflict as ConflictEntry);
    }
  }

  // Check decisions
  for (const decision of ctx.decisions) {
    const record = decision as unknown as Record<string, unknown>;
    if (record._conflict) {
      conflicts.push(record._conflict as ConflictEntry);
    }
  }

  return conflicts;
}

// --- Internal helpers ---

function applyResolution(
  ctx: CtxFile,
  conflict: ConflictEntry,
  value: unknown,
): CtxFile {
  const updated = { ...ctx };

  if (value === null) {
    // Resolution is to remove the entry
    return removeEntry(updated, conflict.section, conflict.key);
  }

  return replaceEntry(updated, conflict.section, conflict.key, value);
}

function applyKeepBoth(ctx: CtxFile, conflict: ConflictEntry): CtxFile {
  // For keep_both, ensure both ours and theirs are in the result
  let updated = { ...ctx };

  if (conflict.ours !== null && conflict.theirs !== null) {
    // Both exist — make sure the entry is the ours version (already present from merge)
    // and add theirs with a modified key if they share the same key
    updated = replaceEntry(updated, conflict.section, conflict.key, conflict.ours);

    // Add theirs with a suffixed key to avoid collision
    const theirsValue = conflict.theirs as Record<string, unknown>;
    const keyField = getKeyField(conflict.section);
    if (keyField && theirsValue) {
      const suffixed = { ...theirsValue, [keyField]: `${conflict.key}_theirs` };
      updated = addEntry(updated, conflict.section, suffixed);
    }
  }

  return updated;
}

function replaceEntry(ctx: CtxFile, section: string, key: string, value: unknown): CtxFile {
  const updated = { ...ctx };
  const keyField = getKeyField(section);

  switch (section) {
    case 'key_files':
      updated.key_files = ctx.key_files.map((kf) =>
        kf[keyField as keyof typeof kf] === key ? (value as typeof kf) : kf,
      );
      break;
    case 'contracts':
      updated.contracts = ctx.contracts.map((c) =>
        c[keyField as keyof typeof c] === key ? (value as typeof c) : c,
      );
      break;
    case 'decisions':
      updated.decisions = ctx.decisions.map((d) =>
        d[keyField as keyof typeof d] === key ? (value as typeof d) : d,
      );
      break;
    case 'refs':
      updated.refs = ctx.refs.map((r) =>
        r[keyField as keyof typeof r] === key ? (value as typeof r) : r,
      );
      break;
  }

  return updated;
}

function removeEntry(ctx: CtxFile, section: string, key: string): CtxFile {
  const updated = { ...ctx };
  const keyField = getKeyField(section);

  switch (section) {
    case 'key_files':
      updated.key_files = ctx.key_files.filter(
        (kf) => kf[keyField as keyof typeof kf] !== key,
      );
      break;
    case 'contracts':
      updated.contracts = ctx.contracts.filter(
        (c) => c[keyField as keyof typeof c] !== key,
      );
      break;
    case 'decisions':
      updated.decisions = ctx.decisions.filter(
        (d) => d[keyField as keyof typeof d] !== key,
      );
      break;
    case 'refs':
      updated.refs = ctx.refs.filter(
        (r) => r[keyField as keyof typeof r] !== key,
      );
      break;
  }

  return updated;
}

function addEntry(ctx: CtxFile, section: string, value: unknown): CtxFile {
  const updated = { ...ctx };

  switch (section) {
    case 'key_files':
      updated.key_files = [...ctx.key_files, value as CtxFile['key_files'][0]];
      break;
    case 'contracts':
      updated.contracts = [...ctx.contracts, value as CtxFile['contracts'][0]];
      break;
    case 'decisions':
      updated.decisions = [...ctx.decisions, value as CtxFile['decisions'][0]];
      break;
    case 'refs':
      updated.refs = [...ctx.refs, value as CtxFile['refs'][0]];
      break;
  }

  return updated;
}

function getKeyField(section: string): string {
  switch (section) {
    case 'key_files': return 'path';
    case 'contracts': return 'name';
    case 'decisions': return 'id';
    case 'refs': return 'target';
    default: return 'key';
  }
}
