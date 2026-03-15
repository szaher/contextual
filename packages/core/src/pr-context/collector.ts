import { execSync } from 'node:child_process';
import type {
  PrContext,
  PromptEntry,
  AgentDecision,
  DecisionSource,
  ContextUsed,
  FileChange,
  FileChangeType,
  CtxUpdate,
  SpecReference,
  PrStats,
} from '../types/pr-context.js';

/** Session data provided to the collector */
export interface SessionData {
  id: string;
  repo_path: string;
  branch: string | null;
  agent_id: string | null;
  started_at: string;
  ended_at: string | null;
  events: RequestEventData[];
  tool_events: ToolEventData[];
}

export interface RequestEventData {
  id: string;
  request_text: string;
  token_count: number;
  created_at: string;
  context_pack: string | null;
}

export interface ToolEventData {
  tool_name: string;
  tool_input: string;
  tool_response: string | null;
  event_type: string;
  duration_ms: number | null;
  created_at: string;
}

export interface CollectorOptions {
  repoRoot: string;
  gitRange?: string;
  linkSpecs?: boolean;
  includeFullPrompts?: boolean;
}

/**
 * Collect PR context from session data and git history.
 */
export function collectPrContext(
  sessions: SessionData[],
  options: CollectorOptions,
): PrContext {
  const { repoRoot, gitRange, linkSpecs, includeFullPrompts } = options;

  const branch = detectBranch(repoRoot);
  const resolvedRange = gitRange || detectGitRange(repoRoot, branch);

  const promptChain = collectPromptChain(sessions, includeFullPrompts);
  const agentDecisions = classifyDecisions(sessions);
  const contextUsed = collectContextUsed(sessions);
  const filesChanged = collectFileChanges(repoRoot, resolvedRange);
  const ctxUpdates = collectCtxUpdates(sessions);
  const specReferences = linkSpecs ? collectSpecReferences(repoRoot) : [];
  const stats = computeStats(sessions, filesChanged, promptChain);

  const summary = generateSummary(sessions, filesChanged);
  const motivation = generateMotivation(sessions);

  return {
    version: 1,
    generated_at: new Date().toISOString(),
    session_ids: sessions.map((s) => s.id),
    git_range: resolvedRange,
    branch,
    summary,
    motivation,
    prompt_chain: promptChain,
    agent_decisions: agentDecisions,
    context_used: contextUsed,
    files_changed: filesChanged,
    ctx_updates: ctxUpdates,
    spec_references: specReferences,
    stats,
  };
}

function detectBranch(repoRoot: string): string | null {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

function detectGitRange(repoRoot: string, branch: string | null): string | null {
  if (!branch || branch === 'main' || branch === 'master') {
    return null;
  }

  try {
    const mergeBase = execSync(`git merge-base main ${branch}`, {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return `${mergeBase}..HEAD`;
  } catch {
    return null;
  }
}

function collectPromptChain(
  sessions: SessionData[],
  includeFullPrompts = false,
): PromptEntry[] {
  const entries: PromptEntry[] = [];
  let index = 0;

  for (const session of sessions) {
    for (const event of session.events) {
      index++;
      const promptText = event.request_text || '';
      const truncated = !includeFullPrompts && promptText.length > 200;

      // Collect tools used from tool events near this prompt
      const toolsUsed = session.tool_events
        .filter((te) => te.created_at >= event.created_at)
        .slice(0, 10)
        .map((te) => te.tool_name)
        .filter((name, i, arr) => arr.indexOf(name) === i);

      // Extract files from tool events
      const filesTouched = extractFilesFromTools(
        session.tool_events.filter((te) => te.created_at >= event.created_at).slice(0, 10),
      );

      entries.push({
        index,
        timestamp: event.created_at,
        prompt: truncated ? promptText.slice(0, 200) : promptText,
        truncated,
        outcome: `Processed with ${event.token_count} tokens`,
        tools_used: toolsUsed,
        files_touched: filesTouched,
      });
    }
  }

  return entries;
}

function extractFilesFromTools(toolEvents: ToolEventData[]): string[] {
  const files = new Set<string>();

  for (const te of toolEvents) {
    if (['Edit', 'Write', 'Read'].includes(te.tool_name)) {
      try {
        const input = JSON.parse(te.tool_input);
        if (input.file_path) files.add(input.file_path);
      } catch { /* skip */ }
    }
  }

  return [...files];
}

function classifyDecisions(sessions: SessionData[]): AgentDecision[] {
  const decisions: AgentDecision[] = [];

  for (const session of sessions) {
    // Classify tool events as decisions
    for (const te of session.tool_events) {
      if (te.event_type === 'tool_success' && ['Write', 'Edit'].includes(te.tool_name)) {
        let source: DecisionSource = 'autonomous';
        let contextRef: string | null = null;

        // Check if preceded by context
        if (te.tool_input.includes('.ctx')) {
          source = 'context-driven';
          const ctxMatch = te.tool_input.match(/([^\s"]+\.ctx)/);
          if (ctxMatch) contextRef = ctxMatch[1];
        }

        try {
          const input = JSON.parse(te.tool_input);
          if (input.file_path) {
            decisions.push({
              decision: `Modified ${input.file_path}`,
              reason: `Tool invocation: ${te.tool_name}`,
              source,
              context_ref: contextRef,
            });
          }
        } catch { /* skip */ }
      }
    }
  }

  // Deduplicate by file path
  const seen = new Set<string>();
  return decisions.filter((d) => {
    if (seen.has(d.decision)) return false;
    seen.add(d.decision);
    return true;
  });
}

function collectContextUsed(sessions: SessionData[]): ContextUsed[] {
  const contextMap = new Map<string, ContextUsed>();

  for (const session of sessions) {
    for (const event of session.events) {
      if (!event.context_pack) continue;

      try {
        const pack = JSON.parse(event.context_pack);
        if (pack.items && Array.isArray(pack.items)) {
          for (const item of pack.items) {
            if (item.source && item.source.endsWith('.ctx')) {
              const existing = contextMap.get(item.source);
              if (existing) {
                if (!existing.sections_used.includes(item.section)) {
                  existing.sections_used.push(item.section);
                }
              } else {
                contextMap.set(item.source, {
                  ctx_path: item.source,
                  sections_used: [item.section],
                  relevance: `Score: ${item.score}`,
                  score: item.score || 0,
                });
              }
            }
          }
        }
      } catch { /* skip */ }
    }
  }

  return [...contextMap.values()].sort((a, b) => b.score - a.score);
}

function collectFileChanges(repoRoot: string, gitRange: string | null): FileChange[] {
  if (!gitRange) return [];

  try {
    const diffOutput = execSync(`git diff --numstat ${gitRange}`, {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    if (!diffOutput) return [];

    const statusOutput = execSync(`git diff --name-status ${gitRange}`, {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const statusMap = new Map<string, FileChangeType>();
    for (const line of statusOutput.split('\n')) {
      const parts = line.split('\t');
      if (parts.length >= 2) {
        const status = parts[0].charAt(0);
        const path = parts[parts.length - 1];
        statusMap.set(path, statusToType(status));
      }
    }

    return diffOutput.split('\n').map((line) => {
      const parts = line.split('\t');
      const added = parseInt(parts[0], 10) || 0;
      const removed = parseInt(parts[1], 10) || 0;
      const path = parts[2] || '';

      return {
        path,
        change_type: statusMap.get(path) || 'modified',
        lines_added: added,
        lines_removed: removed,
        purpose: '',
      };
    });
  } catch {
    return [];
  }
}

function statusToType(status: string): FileChangeType {
  switch (status) {
    case 'A': return 'added';
    case 'D': return 'deleted';
    case 'R': return 'renamed';
    default: return 'modified';
  }
}

function collectCtxUpdates(sessions: SessionData[]): CtxUpdate[] {
  const updates: CtxUpdate[] = [];

  for (const session of sessions) {
    for (const te of session.tool_events) {
      if (['Edit', 'Write'].includes(te.tool_name)) {
        try {
          const input = JSON.parse(te.tool_input);
          if (input.file_path && input.file_path.endsWith('.ctx')) {
            updates.push({
              ctx_path: input.file_path,
              version_change: '',
              diff_summary: '',
              sections_changed: [],
            });
          }
        } catch { /* skip */ }
      }
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return updates.filter((u) => {
    if (seen.has(u.ctx_path)) return false;
    seen.add(u.ctx_path);
    return true;
  });
}

function collectSpecReferences(repoRoot: string): SpecReference[] {
  const refs: SpecReference[] = [];

  try {
    const specFiles = execSync('find specs/ -name "*.md" -type f 2>/dev/null', {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    if (!specFiles) return [];

    for (const specPath of specFiles.split('\n')) {
      if (!specPath) continue;
      refs.push({
        spec_path: specPath,
        section: 'full',
        relationship: 'implements',
      });
    }
  } catch { /* skip */ }

  return refs;
}

function computeStats(
  sessions: SessionData[],
  filesChanged: FileChange[],
  promptChain: PromptEntry[],
): PrStats {
  let totalToolCalls = 0;
  let totalTokens = 0;
  let totalDurationMs = 0;

  for (const session of sessions) {
    totalToolCalls += session.tool_events.length;
    totalTokens += session.events.reduce((sum, e) => sum + e.token_count, 0);

    if (session.started_at && session.ended_at) {
      totalDurationMs += new Date(session.ended_at).getTime() - new Date(session.started_at).getTime();
    }
  }

  return {
    total_prompts: promptChain.length,
    total_tool_calls: totalToolCalls,
    total_tokens_used: totalTokens,
    session_duration_ms: totalDurationMs,
    files_changed_count: filesChanged.length,
    lines_added: filesChanged.reduce((sum, f) => sum + f.lines_added, 0),
    lines_removed: filesChanged.reduce((sum, f) => sum + f.lines_removed, 0),
  };
}

function generateSummary(sessions: SessionData[], filesChanged: FileChange[]): string {
  const sessionCount = sessions.length;
  const fileCount = filesChanged.length;
  const firstPrompt = sessions[0]?.events[0]?.request_text?.slice(0, 100) || 'No prompt data';

  return `${sessionCount} session(s) modifying ${fileCount} file(s). Initial request: "${firstPrompt}"`;
}

function generateMotivation(sessions: SessionData[]): string {
  const firstPrompt = sessions[0]?.events[0]?.request_text || '';
  if (firstPrompt.length > 0) {
    return firstPrompt.slice(0, 500);
  }
  return 'No motivation data available.';
}
