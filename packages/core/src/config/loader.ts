import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { load as yamlLoad } from 'js-yaml';
import type { WorkspaceProfile, GlobalProfile, BudgetConfig, ScoringConfig, AutoApproveConfig, RetentionConfig } from '../types/config.js';
import type { IgnorePolicy } from '../types/ctx.js';
import {
  DEFAULT_BUDGET_TOKENS,
  DEFAULT_SCORING_MODE,
  DEFAULT_SESSIONS_RETENTION_DAYS,
  DEFAULT_AUDIT_RETENTION_DAYS,
} from '../types/config.js';

export interface LoadedProfile {
  budget: BudgetConfig;
  scoring: ScoringConfig;
  ignore: IgnorePolicy;
  auto_approve: AutoApproveConfig;
  retention: RetentionConfig;
  sources: string[];
}

export interface ProfileOverrides {
  budgetTokens?: number;
  scoringMode?: 'lexical' | 'hybrid';
  agentId?: string;
}

const WORKSPACE_CONFIG_PATH = '.ctxl/config.yaml';
const GLOBAL_CONFIG_DIR = '.ctxl';
const GLOBAL_CONFIG_FILE = 'config.yaml';

/**
 * Load profile with full precedence chain.
 * Priority: overrides -> agent config -> workspace -> global -> defaults
 */
export function loadProfile(
  repoRoot: string,
  overrides: ProfileOverrides = {},
): LoadedProfile {
  const sources: string[] = [];

  // Start with system defaults
  let profile: LoadedProfile = {
    budget: { default_tokens: DEFAULT_BUDGET_TOKENS },
    scoring: { mode: DEFAULT_SCORING_MODE },
    ignore: { never_read: [], never_log: [] },
    auto_approve: { sections: [], excluded_owners: [] },
    retention: {
      sessions_days: DEFAULT_SESSIONS_RETENTION_DAYS,
      audit_days: DEFAULT_AUDIT_RETENTION_DAYS,
    },
    sources: ['defaults'],
  };
  sources.push('defaults');

  // Layer 1: Global profile (~/.ctxl/config.yaml)
  const globalPath = join(
    process.env.HOME || process.env.USERPROFILE || '~',
    GLOBAL_CONFIG_DIR,
    GLOBAL_CONFIG_FILE,
  );
  if (existsSync(globalPath)) {
    try {
      const globalConfig = yamlLoad(readFileSync(globalPath, 'utf-8')) as Partial<GlobalProfile>;
      if (globalConfig) {
        profile = mergeGlobalProfile(profile, globalConfig);
        sources.push(globalPath);
      }
    } catch {
      // Ignore invalid global config
    }
  }

  // Layer 2: Workspace profile (.ctxl/config.yaml in repo)
  const workspacePath = join(repoRoot, WORKSPACE_CONFIG_PATH);
  if (existsSync(workspacePath)) {
    try {
      const wsConfig = yamlLoad(readFileSync(workspacePath, 'utf-8')) as Partial<WorkspaceProfile>;
      if (wsConfig) {
        profile = mergeWorkspaceProfile(profile, wsConfig);
        sources.push(workspacePath);
      }
    } catch {
      // Ignore invalid workspace config
    }
  }

  // Layer 3: Agent-specific overrides from workspace profile
  if (overrides.agentId && existsSync(workspacePath)) {
    try {
      const wsConfig = yamlLoad(readFileSync(workspacePath, 'utf-8')) as Partial<WorkspaceProfile>;
      if (wsConfig?.agents?.[overrides.agentId]) {
        const agentConfig = wsConfig.agents[overrides.agentId];
        profile.budget.default_tokens = agentConfig.budget_tokens;
        profile.scoring.mode = agentConfig.mode;
        sources.push(`agent:${overrides.agentId}`);
      }
    } catch {
      // Ignore
    }
  }

  // Layer 4: Per-request overrides (highest priority)
  if (overrides.budgetTokens !== undefined) {
    profile.budget.default_tokens = overrides.budgetTokens;
    sources.push('request-override');
  }
  if (overrides.scoringMode !== undefined) {
    profile.scoring.mode = overrides.scoringMode;
    sources.push('request-override');
  }

  profile.sources = [...new Set(sources)];
  return profile;
}

function mergeGlobalProfile(
  base: LoadedProfile,
  global: Partial<GlobalProfile>,
): LoadedProfile {
  return {
    ...base,
    budget: {
      default_tokens: global.budget?.default_tokens ?? base.budget.default_tokens,
    },
    ignore: mergeIgnore(base.ignore, global.ignore),
  };
}

function mergeWorkspaceProfile(
  base: LoadedProfile,
  ws: Partial<WorkspaceProfile>,
): LoadedProfile {
  return {
    ...base,
    budget: {
      default_tokens: ws.budget?.default_tokens ?? base.budget.default_tokens,
    },
    scoring: {
      mode: ws.scoring?.mode ?? base.scoring.mode,
    },
    ignore: mergeIgnore(base.ignore, ws.ignore),
    auto_approve: {
      sections: ws.auto_approve?.sections ?? base.auto_approve.sections,
      excluded_owners: ws.auto_approve?.excluded_owners ?? base.auto_approve.excluded_owners,
    },
    retention: {
      sessions_days: ws.retention?.sessions_days ?? base.retention.sessions_days,
      audit_days: ws.retention?.audit_days ?? base.retention.audit_days,
    },
  };
}

function mergeIgnore(
  base: IgnorePolicy,
  overlay?: Partial<IgnorePolicy>,
): IgnorePolicy {
  if (!overlay) return base;
  return {
    never_read: [...new Set([...base.never_read, ...(overlay.never_read || [])])],
    never_log: [...new Set([...base.never_log, ...(overlay.never_log || [])])],
  };
}
