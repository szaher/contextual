import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AnalysisResult, BootstrapProposal } from '../types/bootstrap.js';
import type { CtxFile, KeyFile } from '../types/ctx.js';
import { serializeCtxFile } from '../ctx/parser.js';

/**
 * Transform an AnalysisResult into a BootstrapProposal (proposed .ctx file).
 */
export function generateProposal(analysis: AnalysisResult): BootstrapProposal {
  const keyFiles: KeyFile[] = [];

  // Add entry points as key files
  for (const ep of analysis.entry_points) {
    keyFiles.push({
      path: ep,
      purpose: inferFilePurpose(ep),
      tags: analysis.tags.slice(0, 3),
      verified_at: '',
      locked: false,
      owner: null,
    });
  }

  // Add source files (up to 10, excluding entry points and tests)
  const entrySet = new Set(analysis.entry_points);
  const testSet = new Set(analysis.test_files);
  const remaining = analysis.source_files
    .filter((f) => !entrySet.has(f) && !testSet.has(f))
    .slice(0, 10);

  for (const file of remaining) {
    keyFiles.push({
      path: file,
      purpose: inferFilePurpose(file),
      tags: [],
      verified_at: '',
      locked: false,
      owner: null,
    });
  }

  // Estimate tokens
  const tokenEstimate = estimateCtxTokens(analysis, keyFiles.length);

  return {
    path: `${analysis.directory}/.ctx`,
    summary: analysis.summary,
    key_files: keyFiles.map((kf) => kf.path),
    tags: analysis.tags,
    commands: analysis.commands,
    language: analysis.primary_language,
    framework: analysis.framework,
    token_estimate: tokenEstimate,
    _analysis: analysis,
    _ctx: buildCtxFile(analysis, keyFiles),
  };
}

/**
 * Generate proposals for multiple analysis results.
 */
export function generateProposals(results: AnalysisResult[]): BootstrapProposal[] {
  return results.map(generateProposal);
}

/**
 * Apply proposals by writing .ctx files to disk.
 * Returns the list of paths that were written.
 */
export function applyProposals(
  repoRoot: string,
  proposals: BootstrapProposal[],
): string[] {
  const written: string[] = [];

  for (const proposal of proposals) {
    const fullPath = join(repoRoot, proposal.path);
    const ctx = (proposal._ctx as CtxFile | undefined) ?? buildCtxFromProposal(proposal);
    const content = serializeCtxFile(ctx);
    writeFileSync(fullPath, content, 'utf-8');
    written.push(proposal.path);
  }

  return written;
}

// --- Internal helpers ---

function buildCtxFile(analysis: AnalysisResult, keyFiles: KeyFile[]): CtxFile {
  return {
    version: 1,
    summary: analysis.summary,
    key_files: keyFiles,
    contracts: [],
    decisions: [],
    commands: analysis.commands,
    gotchas: [],
    tags: analysis.tags,
    refs: analysis.dependencies.map((dep) => ({
      target: dep,
      sections: ['key_files'],
      reason: 'Detected dependency',
    })),
    ignore: {
      never_read: [],
      never_log: [],
    },
  };
}

function buildCtxFromProposal(proposal: BootstrapProposal): CtxFile {
  return {
    version: 1,
    summary: proposal.summary,
    key_files: proposal.key_files.map((path) => ({
      path,
      purpose: inferFilePurpose(path),
      tags: [],
      verified_at: '',
      locked: false,
      owner: null,
    })),
    contracts: [],
    decisions: [],
    commands: proposal.commands,
    gotchas: [],
    tags: proposal.tags,
    refs: [],
    ignore: {
      never_read: [],
      never_log: [],
    },
  };
}

function inferFilePurpose(filePath: string): string {
  const name = filePath.split('/').pop()?.replace(/\.[^.]+$/, '') ?? '';
  const purposes: Record<string, string> = {
    index: 'Module entry point',
    main: 'Application entry point',
    server: 'Server setup',
    app: 'Application setup',
    cli: 'CLI entry point',
    config: 'Configuration',
    types: 'Type definitions',
    utils: 'Utility functions',
    helpers: 'Helper functions',
    middleware: 'Middleware',
    router: 'Route configuration',
    routes: 'Route handlers',
    controller: 'Request handler',
    service: 'Business logic',
    model: 'Data model',
    schema: 'Schema definitions',
    mod: 'Module root',
  };
  return purposes[name.toLowerCase()] ?? `${name} implementation`;
}

function estimateCtxTokens(analysis: AnalysisResult, keyFileCount: number): number {
  // Rough estimate: ~50 base + ~30 per key_file + ~5 per tag + ~10 per command
  return 50
    + keyFileCount * 30
    + analysis.tags.length * 5
    + Object.keys(analysis.commands).length * 10;
}
