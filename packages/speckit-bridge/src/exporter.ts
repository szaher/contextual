import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { parseCtxFile } from '@ctxkit/core';
import type { CtxFile } from '@ctxkit/core';
import type { ExportResult } from './types.js';

/**
 * Export .ctx decisions, contracts, and gotchas to spec-kit markdown format.
 * Preserves manually-edited sections in existing spec files.
 */
export function exportToSpecKit(
  repoRoot: string,
  outputDir: string,
  format: 'md' | 'yaml' = 'md',
): ExportResult {
  const fullOutputDir = outputDir.startsWith('/')
    ? outputDir
    : join(repoRoot, outputDir);

  if (!existsSync(fullOutputDir)) {
    mkdirSync(fullOutputDir, { recursive: true });
  }

  const ctxFiles = findCtxFiles(repoRoot);
  const result: ExportResult = { exported_files: [] };

  for (const ctxPath of ctxFiles) {
    const content = readFileSync(ctxPath, 'utf-8');
    const { ctx } = parseCtxFile(content);

    // Skip empty .ctx files
    if (ctx.decisions.length === 0 && ctx.contracts.length === 0 && ctx.gotchas.length === 0) {
      continue;
    }

    const relPath = relative(repoRoot, dirname(ctxPath));
    const specName = relPath === '' ? 'root' : relPath.replace(/\//g, '-');
    const ext = format === 'yaml' ? '.yaml' : '.md';
    const outputPath = join(fullOutputDir, `${specName}${ext}`);

    let output: string;
    if (format === 'md') {
      output = renderMarkdown(ctx, specName, relPath);
    } else {
      output = renderYaml(ctx, specName);
    }

    // Preserve manual sections if file already exists
    if (existsSync(outputPath)) {
      output = mergeWithExisting(readFileSync(outputPath, 'utf-8'), output);
    }

    writeFileSync(outputPath, output, 'utf-8');
    result.exported_files.push(relative(repoRoot, outputPath));
  }

  return result;
}

function renderMarkdown(ctx: CtxFile, specName: string, relPath: string): string {
  const lines: string[] = [];

  lines.push(`# ${specName}`);
  lines.push('');
  lines.push(`> Exported from \`${relPath || '.'}\\.ctx\` by ctxl speckit-bridge`);
  lines.push('');

  if (ctx.summary) {
    lines.push('## Overview');
    lines.push('');
    lines.push(ctx.summary);
    lines.push('');
  }

  if (ctx.decisions.length > 0) {
    lines.push('## Decisions');
    lines.push('');
    for (const d of ctx.decisions) {
      lines.push(`### ${d.id}: ${d.title}`);
      lines.push('');
      lines.push(`- **Status**: ${d.status}`);
      lines.push(`- **Date**: ${d.date}`);
      lines.push(`- **Rationale**: ${d.rationale}`);
      if (d.locked) lines.push('- **Locked**: yes');
      if (d.alternatives.length > 0) {
        lines.push('- **Alternatives**:');
        for (const alt of d.alternatives) {
          lines.push(`  - ${alt.name}: ${alt.reason_rejected}`);
        }
      }
      lines.push('');
    }
  }

  if (ctx.contracts.length > 0) {
    lines.push('## Contracts');
    lines.push('');
    for (const c of ctx.contracts) {
      lines.push(`### ${c.name}`);
      lines.push('');
      lines.push(c.content);
      if (c.scope.paths.length > 0) {
        lines.push('');
        lines.push(`**Scope**: ${c.scope.paths.join(', ')}`);
      }
      if (c.scope.tags.length > 0) {
        lines.push(`**Tags**: ${c.scope.tags.join(', ')}`);
      }
      if (c.locked) lines.push('**Locked**: yes');
      lines.push('');
    }
  }

  if (ctx.gotchas.length > 0) {
    lines.push('## Edge Cases');
    lines.push('');
    for (const g of ctx.gotchas) {
      lines.push(`- ${g.text}`);
      if (g.tags.length > 0) {
        lines.push(`  - Tags: ${g.tags.join(', ')}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

function renderYaml(ctx: CtxFile, specName: string): string {
  const lines: string[] = [];

  lines.push(`# Exported from .ctx by ctxl speckit-bridge`);
  lines.push(`name: ${specName}`);
  lines.push(`summary: "${ctx.summary}"`);
  lines.push('');

  if (ctx.decisions.length > 0) {
    lines.push('decisions:');
    for (const d of ctx.decisions) {
      lines.push(`  - id: ${d.id}`);
      lines.push(`    title: "${d.title}"`);
      lines.push(`    status: ${d.status}`);
      lines.push(`    date: "${d.date}"`);
      lines.push(`    rationale: "${d.rationale.replace(/"/g, '\\"')}"`);
      lines.push(`    locked: ${d.locked}`);
    }
    lines.push('');
  }

  if (ctx.contracts.length > 0) {
    lines.push('contracts:');
    for (const c of ctx.contracts) {
      lines.push(`  - name: ${c.name}`);
      lines.push(`    content: "${c.content.replace(/"/g, '\\"')}"`);
      lines.push(`    locked: ${c.locked}`);
    }
    lines.push('');
  }

  if (ctx.gotchas.length > 0) {
    lines.push('gotchas:');
    for (const g of ctx.gotchas) {
      lines.push(`  - text: "${g.text.replace(/"/g, '\\"')}"`);
      lines.push(`    tags: [${g.tags.join(', ')}]`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Merge exported content with existing file, preserving manual sections.
 * Manual sections are delimited by <!-- MANUAL START --> and <!-- MANUAL END -->.
 */
function mergeWithExisting(existing: string, generated: string): string {
  const manualMatch = existing.match(/<!-- MANUAL START -->([\s\S]*?)<!-- MANUAL END -->/);
  if (!manualMatch) {
    return generated;
  }

  const manualSection = manualMatch[0];
  return generated + '\n' + manualSection + '\n';
}

function findCtxFiles(dir: string): string[] {
  const files: string[] = [];

  function walk(d: string): void {
    try {
      const entries = readdirSync(d);
      for (const entry of entries) {
        if (entry === 'node_modules' || entry === '.git' || entry === 'dist') continue;
        const fullPath = join(d, entry);
        try {
          const stat = statSync(fullPath);
          if (stat.isDirectory()) walk(fullPath);
          else if (entry === '.ctx') files.push(fullPath);
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  walk(dir);
  return files;
}
