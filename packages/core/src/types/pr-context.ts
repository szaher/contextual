/** PR context types for generating change documentation from session data */

/** A single prompt in the session's prompt chain */
export interface PromptEntry {
  /** Prompt sequence number */
  index: number;
  /** When the prompt was submitted (ISO 8601) */
  timestamp: string;
  /** The prompt text (truncated to 200 chars) */
  prompt: string;
  /** Whether the prompt was truncated */
  truncated: boolean;
  /** What the prompt accomplished */
  outcome: string;
  /** Tool names invoked */
  tools_used: string[];
  /** Files read or modified */
  files_touched: string[];
}

/** Decision source types */
export type DecisionSource = 'autonomous' | 'context-driven' | 'user-directed' | 'policy-driven';

/** A notable decision made by an agent during the session */
export interface AgentDecision {
  /** What was decided */
  decision: string;
  /** Why this choice was made */
  reason: string;
  /** Decision source type */
  source: DecisionSource;
  /** .ctx path if context-driven */
  context_ref: string | null;
}

/** A .ctx file that informed the work */
export interface ContextUsed {
  /** .ctx file path */
  ctx_path: string;
  /** Which sections were consulted */
  sections_used: string[];
  /** How the context was used */
  relevance: string;
  /** Selection score */
  score: number;
}

/** File change type */
export type FileChangeType = 'added' | 'modified' | 'deleted' | 'renamed';

/** A source file change in the PR */
export interface FileChange {
  /** Changed file path */
  path: string;
  /** Type of change */
  change_type: FileChangeType;
  /** Lines added */
  lines_added: number;
  /** Lines removed */
  lines_removed: number;
  /** Why the file was changed */
  purpose: string;
}

/** A .ctx file modification during the session */
export interface CtxUpdate {
  /** .ctx file path */
  ctx_path: string;
  /** Version transition (e.g., "3→4") */
  version_change: string;
  /** Change summary */
  diff_summary: string;
  /** Sections that changed */
  sections_changed: string[];
}

/** Cross-reference to spec-kit artifacts */
export interface SpecReference {
  /** Spec file path */
  spec_path: string;
  /** Referenced spec section */
  section: string;
  /** Relationship to this PR */
  relationship: string;
}

/** Aggregate statistics for a PR */
export interface PrStats {
  /** Number of prompts */
  total_prompts: number;
  /** Number of tool invocations */
  total_tool_calls: number;
  /** Approximate tokens consumed */
  total_tokens_used: number;
  /** Total session duration in ms */
  session_duration_ms: number;
  /** Number of files changed */
  files_changed_count: number;
  /** Total lines added */
  lines_added: number;
  /** Total lines removed */
  lines_removed: number;
}

/** A synthesized PR context document */
export interface PrContext {
  /** Document schema version (1) */
  version: number;
  /** When the document was generated (ISO 8601) */
  generated_at: string;
  /** Sessions covered by this document */
  session_ids: string[];
  /** Git commit range (merge-base..HEAD) */
  git_range: string | null;
  /** Git branch name */
  branch: string | null;
  /** 2-3 sentence summary */
  summary: string;
  /** Why the change was made */
  motivation: string;
  /** Chronological prompt history */
  prompt_chain: PromptEntry[];
  /** Notable agent decisions */
  agent_decisions: AgentDecision[];
  /** .ctx files that informed the work */
  context_used: ContextUsed[];
  /** Source files modified */
  files_changed: FileChange[];
  /** .ctx file modifications */
  ctx_updates: CtxUpdate[];
  /** Cross-references to spec-kit artifacts */
  spec_references: SpecReference[];
  /** Aggregate statistics */
  stats: PrStats;
}
