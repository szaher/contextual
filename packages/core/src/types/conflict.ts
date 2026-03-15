/** Conflict detection and resolution types for multi-agent .ctx editing */

/** Per-section merge strategy */
export type MergeStrategy =
  | 'union-by-key'       // key_files, contracts, decisions, refs
  | 'last-writer-wins'   // summary, commands
  | 'concatenate-dedup'  // gotchas
  | 'deduplicated-union'; // tags, ignore

/** A record of an incompatible concurrent change within a .ctx file */
export interface ConflictEntry {
  /** Section name (key_files, contracts, decisions, etc.) */
  section: string;
  /** Identity key of the conflicting entry */
  key: string;
  /** Our version of the entry */
  ours: unknown;
  /** Their version of the entry */
  theirs: unknown;
  /** Author of our version */
  ours_author: string;
  /** Author of their version */
  theirs_author: string;
}

/** Resolution choices for a conflict */
export type ResolutionChoice = 'pick_ours' | 'pick_theirs' | 'manual' | 'keep_both';

/** Request to resolve a specific conflict */
export interface ResolutionRequest {
  /** Path to the .ctx file */
  ctx_path: string;
  /** Section containing the conflict */
  section: string;
  /** Key of the conflicting entry */
  key: string;
  /** Resolution choice */
  choice: ResolutionChoice;
  /** Author performing the resolution */
  author: string;
  /** Manual merge content (required when choice is 'manual') */
  manual_content?: unknown;
}

/** Result of a three-way merge operation */
export interface MergeResult {
  /** Whether the merge was clean (no conflicts) */
  clean: boolean;
  /** The merged .ctx file content */
  merged: unknown;
  /** Conflicts that need manual resolution */
  conflicts: ConflictEntry[];
  /** Strategies applied per section */
  strategies: Array<{ section: string; strategy: MergeStrategy }>;
}

/** Section-to-strategy mapping */
export const SECTION_MERGE_STRATEGIES: Record<string, MergeStrategy> = {
  key_files: 'union-by-key',
  contracts: 'union-by-key',
  decisions: 'union-by-key',
  refs: 'union-by-key',
  summary: 'last-writer-wins',
  commands: 'last-writer-wins',
  gotchas: 'concatenate-dedup',
  tags: 'deduplicated-union',
  ignore: 'deduplicated-union',
};
