import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  parseCtxFile,
  redactSecrets,
  estimateTokens,
  loadProfile,
  type CtxFile,
  type Decision,
} from '@ctxl/core';

const CTXKIT_BEGIN = '<!-- CTXKIT:BEGIN - Managed by CtxKit. Do not edit this section. -->';
const CTXKIT_END = '<!-- CTXKIT:END -->';

export interface SyncResult {
  dir: string;
  relativePath: string;
  action: 'created' | 'updated' | 'unchanged';
  tokens: number;
}

export interface SyncOptions {
  repoRoot: string;
  budget: number;
  dryRun: boolean;
}

/**
 * Walk the repo to find all directories containing .ctx files.
 */
export function findCtxDirectories(repoRoot: string): string[] {
  const dirs: string[] = [];

  function walk(dir: string): void {
    const ctxPath = join(dir, '.ctx');
    if (existsSync(ctxPath) && statSync(ctxPath).isFile()) {
      dirs.push(dir);
    }

    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.startsWith('.') || entry === 'node_modules' || entry === 'dist') {
        continue;
      }
      const fullPath = join(dir, entry);
      try {
        if (statSync(fullPath).isDirectory()) {
          walk(fullPath);
        }
      } catch {
        // Skip inaccessible dirs
      }
    }
  }

  walk(repoRoot);
  return dirs;
}

/**
 * Generate the CtxKit-managed content block for a directory's .ctx file.
 */
export function generateCtxKitSection(
  ctx: CtxFile,
  dir: string,
  repoRoot: string,
  budget: number,
): string {
  const contextBudget = Math.floor(budget * 0.7);
  const lines: string[] = [];

  lines.push(`<!-- Generated: ${new Date().toISOString()} | Source: .ctx hierarchy -->`);
  lines.push('');
  lines.push('## CtxKit Project Context');
  lines.push('');

  if (ctx.summary) {
    lines.push(redactSecrets(ctx.summary));
    lines.push('');
  }

  // Key Files
  if (ctx.key_files.length > 0) {
    lines.push('### Key Files');
    for (const kf of ctx.key_files) {
      const purpose = kf.purpose ? ` \u2014 ${redactSecrets(kf.purpose)}` : '';
      lines.push(`- \`${kf.path}\`${purpose}`);
    }
    lines.push('');
  }

  // Decisions (only active ones)
  const activeDecisions = ctx.decisions.filter((d: Decision) => d.status === 'accepted');
  if (activeDecisions.length > 0) {
    lines.push('### Decisions');
    for (const d of activeDecisions) {
      const date = d.date ? ` (decided ${d.date})` : '';
      lines.push(`- ${redactSecrets(d.title)}${date}`);
    }
    lines.push('');
  }

  // Gotchas
  if (ctx.gotchas.length > 0) {
    lines.push('### Gotchas');
    for (const g of ctx.gotchas) {
      lines.push(`- ${redactSecrets(g.text)}`);
    }
    lines.push('');
  }

  // Contracts
  if (ctx.contracts.length > 0) {
    lines.push('### Contracts');
    for (const c of ctx.contracts) {
      lines.push(`- **${c.name}**: ${redactSecrets(c.content).slice(0, 100)}`);
    }
    lines.push('');
  }

  // Check context budget — truncate if needed
  let contextContent = lines.join('\n');
  let contextTokens = estimateTokens(contextContent);
  if (contextTokens > contextBudget) {
    // Progressively remove sections to fit budget
    // Remove contracts first (least critical for AGENTS.md)
    if (ctx.contracts.length > 0) {
      const contractIdx = contextContent.indexOf('### Contracts');
      if (contractIdx >= 0) {
        contextContent = contextContent.slice(0, contractIdx).trimEnd() + '\n';
        contextTokens = estimateTokens(contextContent);
      }
    }
    // If still over, remove gotchas
    if (contextTokens > contextBudget && ctx.gotchas.length > 0) {
      const gotchaIdx = contextContent.indexOf('### Gotchas');
      if (gotchaIdx >= 0) {
        contextContent = contextContent.slice(0, gotchaIdx).trimEnd() + '\n';
        contextTokens = estimateTokens(contextContent);
      }
    }
  }

  // Policy section (uses remaining budget)
  const policyLines: string[] = [];
  policyLines.push('## CtxKit Usage Policy');
  policyLines.push('');
  policyLines.push('When working in this project, you have access to CtxKit tools for context and memory management.');
  policyLines.push('');
  policyLines.push('### Preferred: MCP Tools');
  policyLines.push('If CtxKit MCP server is available (check with `/mcp`), use these tools:');
  policyLines.push('- `ctxkit.context_pack` \u2014 Get relevant context before responding');
  policyLines.push('- `ctxkit.log_event` \u2014 Log tool calls for session tracking');
  policyLines.push('- `ctxkit.propose_update` \u2014 Propose .ctx memory updates');
  policyLines.push('- `ctxkit.memory.search` \u2014 Search project memory');
  policyLines.push('');
  policyLines.push('### Fallback: CLI Commands');
  policyLines.push('If MCP is unavailable, use the CLI directly:');
  policyLines.push('- `ctxkit inject "<request>" --json` \u2014 Get context pack');
  policyLines.push('- `ctxkit sessions list --json` \u2014 List sessions');
  policyLines.push('- `ctxkit propose --json` \u2014 Propose updates');
  policyLines.push('');
  policyLines.push('### Best Practices');
  policyLines.push('- Call `ctxkit.context_pack(mode=turn)` before responding to user prompts');
  policyLines.push('- Call `ctxkit.log_event` after each tool invocation');
  policyLines.push('- Call `ctxkit.propose_update` when you learn something new about the project');

  const fullContent = contextContent + '\n' + policyLines.join('\n');
  return fullContent;
}

/**
 * Merge CtxKit-managed content into an existing AGENTS.md file,
 * preserving user-written content outside the markers.
 */
export function mergeWithExisting(
  existingContent: string,
  ctxkitSection: string,
): string {
  const beginIdx = existingContent.indexOf(CTXKIT_BEGIN);
  const endIdx = existingContent.indexOf(CTXKIT_END);

  const managedBlock = `${CTXKIT_BEGIN}\n${ctxkitSection}\n${CTXKIT_END}`;

  if (beginIdx >= 0 && endIdx >= 0) {
    // Replace existing managed section
    const before = existingContent.slice(0, beginIdx);
    const after = existingContent.slice(endIdx + CTXKIT_END.length);
    return before + managedBlock + after;
  }

  // No markers found — append at the end
  const separator = existingContent.endsWith('\n') ? '\n' : '\n\n';
  return existingContent + separator + managedBlock + '\n';
}

/**
 * Extract the CtxKit-managed section from an existing file.
 */
export function extractManagedSection(content: string): string | null {
  const beginIdx = content.indexOf(CTXKIT_BEGIN);
  const endIdx = content.indexOf(CTXKIT_END);
  if (beginIdx < 0 || endIdx < 0) return null;
  return content.slice(beginIdx + CTXKIT_BEGIN.length, endIdx).trim();
}

/**
 * Strip the generated timestamp line for idempotency comparison.
 * The timestamp changes on every run but the content is otherwise identical.
 */
function stripTimestamp(text: string): string {
  return text.replace(/<!-- Generated: .* \| Source: .ctx hierarchy -->\n?/, '');
}

/**
 * Run the sync-agents command: walk .ctx hierarchy, generate AGENTS.md files.
 */
export function syncAgents(options: SyncOptions): SyncResult[] {
  const { repoRoot, budget, dryRun } = options;
  const results: SyncResult[] = [];

  // Load profile for ignore policies
  const profile = loadProfile(repoRoot);
  const neverRead = new Set(profile.ignore.never_read);

  // Find all directories with .ctx files
  const ctxDirs = findCtxDirectories(repoRoot);

  for (const dir of ctxDirs) {
    const ctxPath = join(dir, '.ctx');
    const relDir = relative(repoRoot, dir) || '.';
    const agentsPath = join(dir, 'AGENTS.md');

    // Check ignore policy
    const relCtxPath = relative(repoRoot, ctxPath);
    if (neverRead.has(relCtxPath) || neverRead.has(relDir)) {
      continue;
    }

    // Parse .ctx file
    let ctx: CtxFile;
    try {
      const raw = readFileSync(ctxPath, 'utf-8');
      const result = parseCtxFile(raw);
      ctx = result.ctx;
    } catch {
      continue; // Skip invalid .ctx files
    }

    // Generate CtxKit section
    const section = generateCtxKitSection(ctx, dir, repoRoot, budget);
    const tokens = estimateTokens(section);

    // Check existing file for idempotency
    if (existsSync(agentsPath)) {
      const existing = readFileSync(agentsPath, 'utf-8');
      const existingManaged = extractManagedSection(existing);

      // Compare without timestamps (they change every run)
      if (existingManaged !== null && stripTimestamp(existingManaged) === stripTimestamp(section.trim())) {
        results.push({
          dir: relDir,
          relativePath: relative(repoRoot, agentsPath),
          action: 'unchanged',
          tokens,
        });
        continue;
      }

      // Merge with existing content (preserve user sections)
      const merged = mergeWithExisting(existing, section);
      if (!dryRun) {
        writeFileSync(agentsPath, merged, 'utf-8');
      }
      results.push({
        dir: relDir,
        relativePath: relative(repoRoot, agentsPath),
        action: 'updated',
        tokens,
      });
    } else {
      // Create new file
      const newContent = `${CTXKIT_BEGIN}\n${section}\n${CTXKIT_END}\n`;
      if (!dryRun) {
        writeFileSync(agentsPath, newContent, 'utf-8');
      }
      results.push({
        dir: relDir,
        relativePath: relative(repoRoot, agentsPath),
        action: 'created',
        tokens,
      });
    }
  }

  return results;
}
