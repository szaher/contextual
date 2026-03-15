import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename, extname, relative } from 'node:path';
import type { AnalysisResult } from '../types/bootstrap.js';

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.next',
  '__pycache__', '.venv', 'venv', 'target', '.cache', '.turbo',
]);

const LANG_MAP: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript', '.jsx': 'javascript',
  '.py': 'python', '.go': 'golang', '.rs': 'rust', '.java': 'java',
  '.kt': 'kotlin', '.swift': 'swift', '.rb': 'ruby', '.cs': 'csharp',
  '.cpp': 'cpp', '.c': 'c', '.php': 'php', '.r': 'r', '.R': 'r',
};

const ENTRY_POINT_PATTERNS = [
  /^index\./i, /^main\./i, /^mod\./i, /^app\./i, /^server\./i, /^cli\./i,
];

const TEST_PATTERNS = [
  /\.test\./, /\.spec\./, /^test_/, /_test\./, /\.tests\./, /\.e2e\./,
];

/**
 * Analyze a directory to infer metadata for .ctx generation.
 * Quick mode: filesystem-only analysis.
 */
export function analyzeDirectory(
  dirPath: string,
  repoRoot: string,
  mode: 'quick' | 'full' = 'quick',
): AnalysisResult {
  const files = listFiles(dirPath);
  const relDir = relative(repoRoot, dirPath) || '.';

  // Detect languages
  const langCounts = new Map<string, number>();
  for (const file of files) {
    const ext = extname(file).toLowerCase();
    const lang = LANG_MAP[ext];
    if (lang) {
      langCounts.set(lang, (langCounts.get(lang) ?? 0) + 1);
    }
  }
  const primaryLanguage = [...langCounts.entries()]
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown';
  const languages = [...langCounts.keys()];

  // Detect entry points
  const entryPoints = files.filter((f) => {
    const name = basename(f);
    return ENTRY_POINT_PATTERNS.some((p) => p.test(name));
  }).map((f) => relative(repoRoot, f));

  // Detect test files
  const testFiles = files.filter((f) => {
    const name = basename(f);
    return TEST_PATTERNS.some((p) => p.test(name));
  }).map((f) => relative(repoRoot, f));

  // Source files (non-test, code files only)
  const sourceFiles = files.filter((f) => {
    const name = basename(f);
    const ext = extname(f).toLowerCase();
    return LANG_MAP[ext] && !TEST_PATTERNS.some((p) => p.test(name));
  }).map((f) => relative(repoRoot, f));

  // Detect commands from config files
  const commands = detectCommands(dirPath);

  // Infer tags
  const tags = inferTags(dirPath, repoRoot, primaryLanguage, files);

  // Detect framework
  const framework = detectFramework(dirPath);

  // Generate summary from README or directory name
  const summary = generateSummary(dirPath, repoRoot);

  // Detect dependencies (from imports/requires)
  const dependencies = mode === 'full'
    ? detectDependencies(dirPath, repoRoot, sourceFiles)
    : [];

  return {
    directory: relDir,
    summary,
    primary_language: primaryLanguage,
    languages,
    framework,
    entry_points: entryPoints,
    test_files: testFiles,
    source_files: sourceFiles,
    commands,
    tags,
    dependencies,
    file_count: files.length,
  };
}

/**
 * Analyze multiple directories at once, filtering by min_files and skip_existing.
 */
export function analyzeDirectories(
  repoRoot: string,
  options: {
    mode?: 'quick' | 'full';
    skipExisting?: boolean;
    minFiles?: number;
    targetPath?: string;
  } = {},
): AnalysisResult[] {
  const { mode = 'quick', skipExisting = true, minFiles = 3, targetPath } = options;
  const startDir = targetPath ? join(repoRoot, targetPath) : repoRoot;
  const dirs = findAnalyzableDirectories(startDir, repoRoot, skipExisting, minFiles);

  return dirs.map((dir) => analyzeDirectory(dir, repoRoot, mode));
}

// --- Internal helpers ---

function listFiles(dirPath: string): string[] {
  const files: string[] = [];
  try {
    const entries = readdirSync(dirPath);
    for (const entry of entries) {
      if (entry.startsWith('.') || IGNORE_DIRS.has(entry)) continue;
      const fullPath = join(dirPath, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isFile()) files.push(fullPath);
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return files;
}

function findAnalyzableDirectories(
  startDir: string,
  repoRoot: string,
  skipExisting: boolean,
  minFiles: number,
): string[] {
  const result: string[] = [];

  function walk(dir: string): void {
    const files = listFiles(dir);
    const codeFiles = files.filter((f) => LANG_MAP[extname(f).toLowerCase()]);

    if (codeFiles.length >= minFiles) {
      if (skipExisting && existsSync(join(dir, '.ctx'))) {
        // Skip directories that already have .ctx files
      } else {
        result.push(dir);
      }
    }

    // Recurse into subdirectories
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (entry.startsWith('.') || IGNORE_DIRS.has(entry)) continue;
        const fullPath = join(dir, entry);
        try {
          if (statSync(fullPath).isDirectory()) walk(fullPath);
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  walk(startDir);
  return result;
}

function detectCommands(dirPath: string): Record<string, string> {
  const commands: Record<string, string> = {};

  // package.json scripts
  const pkgPath = join(dirPath, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (pkg.scripts) {
        if (pkg.scripts.test) commands.test = pkg.scripts.test;
        if (pkg.scripts.build) commands.build = pkg.scripts.build;
        if (pkg.scripts.lint) commands.lint = pkg.scripts.lint;
        if (pkg.scripts.start) commands.start = pkg.scripts.start;
        if (pkg.scripts.dev) commands.dev = pkg.scripts.dev;
      }
    } catch { /* skip */ }
  }

  // Makefile targets
  const makePath = join(dirPath, 'Makefile');
  if (existsSync(makePath)) {
    try {
      const content = readFileSync(makePath, 'utf-8');
      const targets = content.match(/^([a-zA-Z_-]+):/gm);
      if (targets) {
        for (const target of targets.slice(0, 5)) {
          const name = target.replace(':', '');
          commands[name] = `make ${name}`;
        }
      }
    } catch { /* skip */ }
  }

  // Cargo.toml
  if (existsSync(join(dirPath, 'Cargo.toml'))) {
    commands.build = 'cargo build';
    commands.test = 'cargo test';
  }

  // go.mod
  if (existsSync(join(dirPath, 'go.mod'))) {
    commands.build = 'go build ./...';
    commands.test = 'go test ./...';
  }

  return commands;
}

function inferTags(dirPath: string, repoRoot: string, lang: string, files: string[]): string[] {
  const tags: string[] = [];
  const dirName = basename(dirPath).toLowerCase();

  if (lang !== 'unknown') tags.push(lang);

  const contextTags = ['auth', 'api', 'db', 'ui', 'cli', 'core', 'utils', 'config', 'middleware', 'test', 'docs'];
  if (contextTags.includes(dirName)) tags.push(dirName);

  // Detect test directory
  if (dirName === 'test' || dirName === 'tests' || dirName === '__tests__') {
    tags.push('testing');
  }

  // Detect from file presence
  if (files.some((f) => basename(f) === 'Dockerfile')) tags.push('docker');
  if (files.some((f) => basename(f).includes('.test.') || basename(f).includes('.spec.'))) tags.push('testing');

  return [...new Set(tags)];
}

function detectFramework(dirPath: string): string | null {
  const pkgPath = join(dirPath, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.react) return 'react';
      if (deps.vue) return 'vue';
      if (deps.angular) return 'angular';
      if (deps.express) return 'express';
      if (deps.hono) return 'hono';
      if (deps.next) return 'nextjs';
      if (deps.svelte) return 'svelte';
    } catch { /* skip */ }
  }

  if (existsSync(join(dirPath, 'Cargo.toml'))) {
    try {
      const cargo = readFileSync(join(dirPath, 'Cargo.toml'), 'utf-8');
      if (cargo.includes('actix')) return 'actix';
      if (cargo.includes('rocket')) return 'rocket';
      if (cargo.includes('tokio')) return 'tokio';
    } catch { /* skip */ }
  }

  return null;
}

function generateSummary(dirPath: string, repoRoot: string): string {
  // Try README
  const readmePaths = ['README.md', 'readme.md', 'README.txt', 'README'];
  for (const readmeName of readmePaths) {
    const readmePath = join(dirPath, readmeName);
    if (existsSync(readmePath)) {
      try {
        const content = readFileSync(readmePath, 'utf-8');
        const firstLine = content.split('\n').find((l) => l.trim() && !l.startsWith('#'));
        if (firstLine) return firstLine.trim().slice(0, 200);
        const heading = content.match(/^#\s+(.+)/m);
        if (heading) return heading[1].trim();
      } catch { /* skip */ }
    }
  }

  // Fallback to directory name
  const dirName = basename(dirPath);
  const relPath = relative(repoRoot, dirPath);
  return `${dirName} module (${relPath})`;
}

function detectDependencies(dirPath: string, repoRoot: string, sourceFiles: string[]): string[] {
  const deps = new Set<string>();

  for (const relFile of sourceFiles.slice(0, 10)) {
    const fullPath = join(repoRoot, relFile);
    try {
      const content = readFileSync(fullPath, 'utf-8');
      // Look for relative imports that reference other directories
      const importMatches = content.matchAll(/(?:import|from)\s+['"](\.\.[^'"]+)['"]/g);
      for (const match of importMatches) {
        const importPath = match[1];
        // Normalize to directory
        const parts = importPath.split('/');
        if (parts.length >= 2) {
          deps.add(parts.slice(0, 2).join('/'));
        }
      }
    } catch { /* skip */ }
  }

  return [...deps];
}
