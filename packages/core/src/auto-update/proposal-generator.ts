import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, basename } from 'node:path';
import { parseCtxFile } from '../ctx/parser.js';
import type { CtxFile, KeyFile } from '../types/ctx.js';

export interface UpdateProposal {
  /** Path to the .ctx file to update */
  ctx_path: string;
  /** Proposed changes */
  changes: ProposedChange[];
  /** Human-readable summary */
  summary: string;
}

export interface ProposedChange {
  /** Type of change */
  type: 'add_key_file' | 'remove_key_file' | 'update_summary' | 'add_tag' | 'remove_tag';
  /** Section being changed */
  section: string;
  /** The proposed value */
  value: unknown;
  /** Reason for the change */
  reason: string;
}

/**
 * Generate .ctx update proposals for stale directories.
 * Analyzes git diff to determine what changed and proposes corresponding .ctx updates.
 *
 * @param repoRoot - Repository root path
 * @param staleDirectories - Directories with recent modifications
 * @param sinceRef - Git ref to diff from (default: HEAD~1)
 */
export function generateProposals(
  repoRoot: string,
  staleDirectories: string[],
  _sinceRef: string = 'HEAD',
): UpdateProposal[] {
  const proposals: UpdateProposal[] = [];

  for (const dir of staleDirectories) {
    const ctxPath = findCtxFile(dir, repoRoot);
    if (!ctxPath) continue;

    const changes = analyzeDirectoryChanges(repoRoot, dir, ctxPath);
    if (changes.length === 0) continue;

    const summary = changes.map((c) => `${c.type}: ${c.reason}`).join('; ');
    proposals.push({
      ctx_path: relative(repoRoot, ctxPath),
      changes,
      summary,
    });
  }

  return proposals;
}

/**
 * Analyze changes in a directory and generate proposed .ctx updates.
 */
function analyzeDirectoryChanges(
  repoRoot: string,
  directory: string,
  ctxPath: string,
): ProposedChange[] {
  const changes: ProposedChange[] = [];

  // Read existing .ctx file
  let ctx: CtxFile;
  try {
    const content = readFileSync(ctxPath, 'utf-8');
    const result = parseCtxFile(content);
    ctx = result.ctx;
  } catch {
    return changes;
  }

  // Get current files in the directory
  const currentFiles = listSourceFiles(directory);
  const existingPaths = new Set(ctx.key_files.map((kf) => kf.path));

  // Find new source files not in key_files
  for (const file of currentFiles) {
    const relPath = relative(repoRoot, file);
    if (!existingPaths.has(relPath) && isSignificantFile(file)) {
      changes.push({
        type: 'add_key_file',
        section: 'key_files',
        value: {
          path: relPath,
          purpose: inferPurpose(file),
          tags: inferTags(file),
          verified_at: '',
          locked: false,
          owner: null,
        } satisfies KeyFile,
        reason: `New file detected: ${basename(file)}`,
      });
    }
  }

  // Find key_files entries where the file no longer exists
  const currentFileSet = new Set(currentFiles.map((f) => relative(repoRoot, f)));
  for (const kf of ctx.key_files) {
    if (!currentFileSet.has(kf.path) && !existsSync(join(repoRoot, kf.path))) {
      changes.push({
        type: 'remove_key_file',
        section: 'key_files',
        value: kf.path,
        reason: `File deleted: ${basename(kf.path)}`,
      });
    }
  }

  return changes;
}

/**
 * Find the .ctx file for a directory (check directory itself, then parent).
 */
function findCtxFile(directory: string, repoRoot: string): string | null {
  const directCtx = join(directory, '.ctx');
  if (existsSync(directCtx)) return directCtx;

  // Check if there's a parent .ctx
  const parts = relative(repoRoot, directory).split('/');
  for (let i = parts.length - 1; i >= 0; i--) {
    const parentDir = join(repoRoot, ...parts.slice(0, i));
    const parentCtx = join(parentDir, '.ctx');
    if (existsSync(parentCtx)) return parentCtx;
  }

  return null;
}

/**
 * List source files in a directory (non-recursive, skip hidden/build files).
 */
function listSourceFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];

  const files: string[] = [];
  try {
    const entries = readdirSync(directory);
    for (const entry of entries) {
      if (entry.startsWith('.') || entry === 'node_modules' || entry === 'dist' || entry === 'build') continue;
      const fullPath = join(directory, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isFile()) {
          files.push(fullPath);
        }
      } catch {
        // Skip inaccessible files
      }
    }
  } catch {
    // Skip inaccessible directories
  }
  return files;
}

/**
 * Check if a file is significant enough to be a key_file.
 */
function isSignificantFile(filePath: string): boolean {
  const name = basename(filePath);
  const ext = name.split('.').pop()?.toLowerCase() ?? '';

  // Source code extensions
  const sourceExts = ['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'java', 'kt', 'swift', 'rb', 'cs'];
  if (sourceExts.includes(ext)) return true;

  // Config files
  const configNames = ['Makefile', 'Dockerfile', 'docker-compose.yml', 'package.json', 'Cargo.toml', 'go.mod'];
  if (configNames.includes(name)) return true;

  return false;
}

/**
 * Infer the purpose of a file from its name.
 */
function inferPurpose(filePath: string): string {
  const name = basename(filePath).replace(/\.[^.]+$/, '');

  const purposeMap: Record<string, string> = {
    index: 'Module entry point',
    main: 'Application entry point',
    server: 'Server setup',
    client: 'Client implementation',
    config: 'Configuration',
    types: 'Type definitions',
    utils: 'Utility functions',
    helpers: 'Helper functions',
    middleware: 'Middleware',
    router: 'Routing',
    routes: 'Route handlers',
    controller: 'Controller',
    service: 'Service layer',
    model: 'Data model',
    schema: 'Schema definitions',
    test: 'Tests',
    spec: 'Test specifications',
  };

  return purposeMap[name.toLowerCase()] ?? `${name} module`;
}

/**
 * Infer tags from a file path.
 */
function inferTags(filePath: string): string[] {
  const tags: string[] = [];
  const ext = basename(filePath).split('.').pop()?.toLowerCase() ?? '';

  const langMap: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', go: 'golang', rs: 'rust', java: 'java', rb: 'ruby',
  };

  if (langMap[ext]) tags.push(langMap[ext]);

  // Infer from path segments
  const parts = filePath.split('/');
  const contextualTags = ['auth', 'api', 'db', 'ui', 'test', 'config', 'utils', 'middleware'];
  for (const part of parts) {
    if (contextualTags.includes(part.toLowerCase())) {
      tags.push(part.toLowerCase());
    }
  }

  return tags;
}
