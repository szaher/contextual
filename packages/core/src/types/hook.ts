/**
 * Shared hook types used by both @ctxl/mcp and @ctxl/claude-plugin.
 */

/** Common input fields received by all hook handlers on stdin. */
export interface HookInputBase {
  session_id: string;
  transcript_path: string;
  cwd: string;
  permission_mode: string;
  hook_event_name: string;
}

/** Common output fields returned by all hook handlers on stdout. */
export interface HookOutput {
  continue?: boolean;
  stopReason?: string;
  suppressOutput?: boolean;
  systemMessage?: string;
  hookSpecificOutput?: {
    hookEventName: string;
    additionalContext?: string;
    permissionDecision?: 'allow' | 'deny' | 'ask';
    permissionDecisionReason?: string;
  };
}

/** Hook-specific config settings loaded from workspace profile. */
export interface HookConfig {
  preToolUse: {
    enabled: boolean;
    allowlist: string[];
    budget: number;
  };
  sessionEnd: {
    close: boolean;
    propose_final_update: boolean;
    propose_scope: 'cwd' | 'repo';
  };
}

/** Default hook configuration values. */
export const DEFAULT_HOOK_CONFIG: HookConfig = {
  preToolUse: {
    enabled: true,
    allowlist: ['Bash', 'Edit', 'Write', 'NotebookEdit', 'Agent'],
    budget: 2000,
  },
  sessionEnd: {
    close: true,
    propose_final_update: false,
    propose_scope: 'cwd',
  },
};
