import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseCtxFile, serializeCtxFile } from '../ctx/parser.js';
import { computeChecksum } from './checksum.js';
import { estimateTokens } from '../packer/tokens.js';
import { readIndex, writeIndex } from './generator.js';
import type { CtxlEntry } from '../types/ctxl.js';

/**
 * Update a single entry in the .ctxl index without re-scanning the entire repo.
 * Recalculates checksum, timestamp, token estimate, and sections for the given .ctx path.
 */
export function updateIndexEntry(
  repoRoot: string,
  ctxRelativePath: string,
): { updated: boolean; entry: CtxlEntry | null } {
  const index = readIndex(repoRoot);
  if (!index) {
    return { updated: false, entry: null };
  }

  const ctxAbsPath = join(repoRoot, ctxRelativePath);

  let content: string;
  try {
    content = readFileSync(ctxAbsPath, 'utf-8');
  } catch {
    // File was deleted — remove from index
    index.entries = index.entries.filter((e) => e.path !== ctxRelativePath);
    delete index.graph[ctxRelativePath];
    // Remove from depended_by of other entries
    for (const node of Object.values(index.graph)) {
      node.depended_by = node.depended_by.filter((p) => p !== ctxRelativePath);
    }
    index.updated_at = new Date().toISOString();
    writeIndex(repoRoot, index);
    return { updated: true, entry: null };
  }

  const { ctx } = parseCtxFile(content);
  const checksum = computeChecksum(ctx);
  const serialized = serializeCtxFile(ctx);
  const tokenEstimate = estimateTokens(serialized);
  const depth = dirname(ctxRelativePath).split('/').filter((p) => p !== '.').length;

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

  // Get last modified info
  let lastModified = new Date().toISOString();
  let lastModifiedBy = 'developer:unknown';
  if (ctx._history && ctx._history.length > 0) {
    lastModified = ctx._history[0].timestamp;
    lastModifiedBy = ctx._history[0].author;
  } else {
    try {
      const stat = statSync(ctxAbsPath);
      lastModified = stat.mtime.toISOString();
    } catch {
      // keep default
    }
  }

  // Dependencies from refs
  const dependencies = ctx.refs.map((ref) => {
    return ref.target.endsWith('.ctx') ? ref.target : `${ref.target}/.ctx`;
  });

  const newEntry: CtxlEntry = {
    path: ctxRelativePath,
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

  // Check if entry already exists
  const existingIdx = index.entries.findIndex((e) => e.path === ctxRelativePath);
  if (existingIdx >= 0) {
    // Preserve weight from existing entry
    newEntry.weight = index.entries[existingIdx].weight;
    index.entries[existingIdx] = newEntry;
  } else {
    index.entries.push(newEntry);
  }

  // Update graph
  index.graph[ctxRelativePath] = {
    depends_on: dependencies,
    depended_by: index.graph[ctxRelativePath]?.depended_by ?? [],
  };

  // Update depended_by for new dependencies
  for (const dep of dependencies) {
    if (index.graph[dep]) {
      if (!index.graph[dep].depended_by.includes(ctxRelativePath)) {
        index.graph[dep].depended_by.push(ctxRelativePath);
      }
    }
  }

  index.updated_at = new Date().toISOString();
  writeIndex(repoRoot, index);

  return { updated: true, entry: newEntry };
}
