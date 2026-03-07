import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

import { parseCtxFile } from './parser.js';
import type { CtxFile, IgnorePolicy } from '../types/ctx.js';

export interface MergeOptions {
  /** The working directory to start loading from */
  workingDir: string;
  /** The repository root directory */
  repoRoot: string;
  /** Maximum number of refs to follow (prevents runaway) */
  maxRefDepth?: number;
  /** Ignore policy to apply during merge */
  ignorePolicy?: IgnorePolicy;
}

export interface MergedContext {
  /** The merged .ctx data */
  ctx: CtxFile;
  /** Source .ctx files that contributed, from highest to lowest priority */
  sources: string[];
  /** Warnings generated during merge (e.g., cycle detection) */
  warnings: string[];
}

const CTX_FILENAME = '.ctx';

/**
 * Load and merge .ctx files hierarchically from workingDir up to repoRoot.
 * Follows refs with cycle detection.
 */
export function mergeCtxHierarchy(options: MergeOptions): MergedContext {
  const { workingDir, repoRoot, maxRefDepth = 10 } = options;

  const ctxPaths = collectCtxPaths(workingDir, repoRoot);
  const warnings: string[] = [];
  const visited = new Set<string>();
  const allSources: string[] = [];

  // Apply ignore policy to exclude paths
  let filteredPaths = ctxPaths;
  if (options.ignorePolicy?.never_read.length) {
    filteredPaths = ctxPaths.filter((p) => {
      const relPath = relative(repoRoot, p);
      return !options.ignorePolicy!.never_read.some((pattern) => {
        if (pattern.endsWith('*')) {
          return relPath.startsWith(pattern.slice(0, -1));
        }
        if (pattern.endsWith('/')) {
          return relPath === pattern.slice(0, -1) || relPath.startsWith(pattern);
        }
        return relPath === pattern;
      });
    });
  }

  // Load all .ctx files (child first = highest priority)
  const ctxFiles: Array<{ path: string; ctx: CtxFile }> = [];
  for (const ctxPath of filteredPaths) {
    const loaded = loadWithRefs(ctxPath, visited, warnings, maxRefDepth, repoRoot);
    ctxFiles.push(...loaded);
    allSources.push(...loaded.map((l) => l.path));
  }

  if (ctxFiles.length === 0) {
    return {
      ctx: emptyCtx(),
      sources: [],
      warnings: ['No .ctx files found in hierarchy'],
    };
  }

  // Merge: process root (lowest priority) first, then override with child entries.
  // ctxFiles is ordered child-first, so reverse to process root-first.
  const reversed = [...ctxFiles].reverse();
  const merged = reversed.reduce((acc, { ctx }) => mergeTwo(acc, ctx), emptyCtx());

  return {
    ctx: merged,
    sources: [...new Set(allSources)],
    warnings,
  };
}

/**
 * Collect .ctx file paths from workingDir up to repoRoot.
 * Returns paths from child (highest priority) to root (lowest priority).
 */
function collectCtxPaths(workingDir: string, repoRoot: string): string[] {
  const paths: string[] = [];
  let current = resolve(workingDir);
  const root = resolve(repoRoot);

  while (true) {
    const ctxPath = join(current, CTX_FILENAME);
    if (existsSync(ctxPath)) {
      paths.push(ctxPath);
    }

    if (current === root || current === dirname(current)) {
      break;
    }

    current = dirname(current);
  }

  return paths;
}

/**
 * Load a .ctx file and follow its refs, tracking visited paths for cycle detection.
 */
function loadWithRefs(
  ctxPath: string,
  visited: Set<string>,
  warnings: string[],
  maxDepth: number,
  repoRoot: string,
  depth: number = 0,
): Array<{ path: string; ctx: CtxFile }> {
  const resolved = resolve(ctxPath);

  if (visited.has(resolved)) {
    warnings.push(`Circular reference detected: ${relative(repoRoot, resolved)} (skipped)`);
    return [];
  }

  if (depth > maxDepth) {
    warnings.push(`Max ref depth (${maxDepth}) exceeded at ${relative(repoRoot, resolved)}`);
    return [];
  }

  visited.add(resolved);

  let ctx: CtxFile;
  try {
    const content = readFileSync(resolved, 'utf-8');
    const result = parseCtxFile(content);
    ctx = result.ctx;
    warnings.push(...result.warnings);
  } catch (err) {
    warnings.push(`Failed to load ${relative(repoRoot, resolved)}: ${(err as Error).message}`);
    return [];
  }

  const results: Array<{ path: string; ctx: CtxFile }> = [
    { path: relative(repoRoot, resolved), ctx },
  ];

  // Follow refs
  for (const ref of ctx.refs) {
    const refPath = resolve(dirname(resolved), ref.target);
    const refResults = loadWithRefs(refPath, visited, warnings, maxDepth, repoRoot, depth + 1);
    results.push(...refResults);
  }

  return results;
}

/**
 * Merge two CtxFile objects. `child` has higher priority than `parent`.
 */
function mergeTwo(parent: CtxFile, child: CtxFile): CtxFile {
  return {
    version: Math.max(parent.version, child.version),
    // Summary: child replaces parent (if child has one)
    summary: child.summary || parent.summary,
    // Key files: union, child overrides parent by path
    key_files: mergeByKey(parent.key_files, child.key_files, (kf) => kf.path),
    // Contracts: union, child overrides parent by name
    contracts: mergeByKey(parent.contracts, child.contracts, (c) => c.name),
    // Decisions: union, child overrides parent by id
    decisions: mergeByKey(parent.decisions, child.decisions, (d) => d.id),
    // Commands: child overrides parent by key
    commands: { ...parent.commands, ...child.commands },
    // Gotchas: concatenated, child first
    gotchas: [...child.gotchas, ...parent.gotchas],
    // Tags: union
    tags: [...new Set([...parent.tags, ...child.tags])],
    // Refs: union (but already followed during load)
    refs: [...child.refs, ...parent.refs],
    // Ignore: union (deny-list grows monotonically)
    ignore: mergeIgnore(parent.ignore, child.ignore),
  };
}

/**
 * Merge arrays by a key function. Child entries override parent entries
 * with the same key. Maintains child-first ordering.
 */
function mergeByKey<T>(parent: T[], child: T[], keyFn: (item: T) => string): T[] {
  const childKeys = new Set(child.map(keyFn));
  const parentOnly = parent.filter((item) => !childKeys.has(keyFn(item)));
  return [...child, ...parentOnly];
}

function mergeIgnore(parent: IgnorePolicy, child: IgnorePolicy): IgnorePolicy {
  return {
    never_read: [...new Set([...parent.never_read, ...child.never_read])],
    never_log: [...new Set([...parent.never_log, ...child.never_log])],
  };
}

function emptyCtx(): CtxFile {
  return {
    version: 1,
    summary: '',
    key_files: [],
    contracts: [],
    decisions: [],
    commands: {},
    gotchas: [],
    tags: [],
    refs: [],
    ignore: { never_read: [], never_log: [] },
  };
}
