import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import yaml from 'js-yaml';
import { parseCtxFile } from '../ctx/parser.js';
import { computeChecksum } from './checksum.js';
import { estimateTokens } from '../packer/tokens.js';
import { serializeCtxFile } from '../ctx/parser.js';
import type { CtxlIndex, CtxlEntry, CtxlGraphNode } from '../types/ctxl.js';
import { DEFAULT_CTXL_DEFAULTS, DEFAULT_POLICIES } from '../types/ctxl.js';

/**
 * Walk a repository to find all .ctx files.
 */
export function findCtxFiles(repoRoot: string): string[] {
  const results: string[] = [];

  function walk(dir: string): void {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // skip unreadable directories
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip common non-project directories
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === 'build') {
          continue;
        }
        walk(fullPath);
      } else if (entry.name === '.ctx') {
        results.push(fullPath);
      }
    }
  }

  walk(repoRoot);
  return results.sort();
}

/**
 * Generate a .ctxl index from all .ctx files in a repository.
 */
export function generateIndex(repoRoot: string, repoName?: string): CtxlIndex {
  const ctxPaths = findCtxFiles(repoRoot);
  const entries: CtxlEntry[] = [];
  const graph: Record<string, CtxlGraphNode> = {};
  const now = new Date().toISOString();

  for (const ctxPath of ctxPaths) {
    const relativePath = relative(repoRoot, ctxPath);
    const content = readFileSync(ctxPath, 'utf-8');
    const { ctx } = parseCtxFile(content);
    const checksum = computeChecksum(ctx);
    const depth = dirname(relativePath).split('/').filter((p) => p !== '.').length;
    const serialized = serializeCtxFile(ctx);
    const tokenEstimate = estimateTokens(serialized);

    // Determine sections present
    const sections: string[] = [];
    if (ctx.summary) sections.push('summary');
    if (ctx.key_files.length > 0) sections.push('key_files');
    if (ctx.contracts.length > 0) sections.push('contracts');
    if (ctx.decisions.length > 0) sections.push('decisions');
    if (Object.keys(ctx.commands).length > 0) sections.push('commands');
    if (ctx.gotchas.length > 0) sections.push('gotchas');
    if (ctx.tags.length > 0) sections.push('tags');
    if (ctx.refs.length > 0) sections.push('refs');
    if (ctx.ignore.never_read.length > 0 || ctx.ignore.never_log.length > 0) sections.push('ignore');

    // Get last modified info from history or file stat
    let lastModified = now;
    let lastModifiedBy = 'developer:unknown';
    if (ctx._history && ctx._history.length > 0) {
      lastModified = ctx._history[0].timestamp;
      lastModifiedBy = ctx._history[0].author;
    } else {
      try {
        const stat = statSync(ctxPath);
        lastModified = stat.mtime.toISOString();
      } catch {
        // keep default
      }
    }

    // Detect dependencies from refs
    const dependencies = ctx.refs.map((ref) => {
      // Resolve ref target to a .ctx path
      const refDir = ref.target.endsWith('.ctx')
        ? ref.target
        : join(ref.target, '.ctx');
      return refDir;
    });

    const entry: CtxlEntry = {
      path: relativePath,
      summary: ctx.summary || '',
      tags: ctx.tags,
      depth,
      ctx_version: ctx.version,
      last_modified: lastModified,
      last_modified_by: lastModifiedBy,
      checksum,
      dependencies,
      weight: 1.0,
      sections,
      has_conflicts: false,
      token_estimate: tokenEstimate,
    };

    entries.push(entry);

    // Build graph node
    graph[relativePath] = {
      depends_on: dependencies,
      depended_by: [],
    };
  }

  // Fill depended_by edges
  for (const entry of entries) {
    for (const dep of entry.dependencies) {
      if (graph[dep]) {
        graph[dep].depended_by.push(entry.path);
      }
    }
  }

  const index: CtxlIndex = {
    version: 1,
    repo: repoName || dirname(repoRoot).split('/').pop() || 'unknown',
    generated_at: now,
    updated_at: now,
    defaults: DEFAULT_CTXL_DEFAULTS,
    entries,
    graph,
    policies: DEFAULT_POLICIES,
  };

  return index;
}

/**
 * Write a CtxlIndex to a .ctxl file.
 */
export function writeIndex(repoRoot: string, index: CtxlIndex): string {
  const indexPath = join(repoRoot, '.ctxl');
  const content = yaml.dump(index, {
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
    quotingType: '"',
  });
  writeFileSync(indexPath, content, 'utf-8');
  return indexPath;
}

/**
 * Read a CtxlIndex from a .ctxl file.
 */
export function readIndex(repoRoot: string): CtxlIndex | null {
  const indexPath = join(repoRoot, '.ctxl');
  try {
    const content = readFileSync(indexPath, 'utf-8');
    return yaml.load(content) as CtxlIndex;
  } catch {
    return null;
  }
}
