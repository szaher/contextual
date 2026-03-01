/**
 * MCP-specific types (not shared with other packages).
 */

/** Tool event logged to session timeline. */
export interface ToolEvent {
  session_id: string;
  event_type: 'tool_success' | 'tool_failure';
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_response?: Record<string, unknown>;
  error?: string;
  file_paths?: string[];
  exit_code?: number;
  duration_ms?: number;
  created_at: string;
}

/** Compaction spine for PreCompact hook. */
export interface CompactionSpine {
  session_id: string;
  active_proposals: Array<{ id: string; ctx_path: string; summary: string }>;
  key_ctx_paths: string[];
  last_context_pack_id: string | null;
  environment: {
    CTXKIT_SESSION_ID: string;
    CTXKIT_API: string;
    CTXKIT_REPO_ROOT: string;
  };
}

/** Generated section for AGENTS.md files. */
export interface AgentsMdSection {
  directory: string;
  ctx_summary: string;
  usage_policy: string;
  token_count: number;
}
