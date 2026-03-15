import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseCtxFile, serializeCtxFile, bumpVersion, generateDiffSummary } from '@ctxkit/core';
import type { CtxFile, Decision, Contract, Gotcha, ContractScope } from '@ctxkit/core';
import type { ImportResult } from './types.js';

/**
 * Parse a constitution markdown file and extract principles as locked decisions
 * and technical boundaries as locked contracts.
 */
export function parseConstitution(content: string): {
  decisions: Decision[];
  contracts: Contract[];
} {
  const decisions: Decision[] = [];
  const contracts: Contract[] = [];
  const now = new Date().toISOString();

  const lines = content.split('\n');
  let currentPrinciple: { id: string; title: string; content: string[] } | null = null;
  let principleIndex = 0;

  for (const line of lines) {
    // Match headings like ## I. Principle Name or ## 1. Principle Name or ### Principle Name
    const headingMatch = line.match(/^#{2,3}\s+(?:([IVXLCDM]+|[0-9]+)\.\s+)?(.+)$/);

    if (headingMatch) {
      // Flush previous principle
      if (currentPrinciple) {
        flushPrinciple(currentPrinciple, decisions, contracts, now);
      }

      principleIndex++;
      const numeral = headingMatch[1] || String(principleIndex);
      const title = headingMatch[2].trim();

      currentPrinciple = {
        id: `CONST-${numeral}`,
        title,
        content: [],
      };
    } else if (currentPrinciple && line.trim().length > 0) {
      currentPrinciple.content.push(line);
    }
  }

  // Flush last principle
  if (currentPrinciple) {
    flushPrinciple(currentPrinciple, decisions, contracts, now);
  }

  return { decisions, contracts };
}

function flushPrinciple(
  principle: { id: string; title: string; content: string[] },
  decisions: Decision[],
  contracts: Contract[],
  now: string,
): void {
  const body = principle.content.join('\n').trim();

  // Check for MUST/SHALL keywords indicating technical boundaries → contract
  const hasTechnicalBoundary = /\bMUST\b|\bSHALL\b|\bREQUIRED\b/.test(body);

  // Always create a decision for the principle
  decisions.push({
    id: principle.id,
    title: principle.title,
    status: 'accepted',
    date: now.split('T')[0],
    rationale: body.slice(0, 500),
    alternatives: [],
    verified_at: now,
    locked: true,
    owner: 'speckit-bridge',
  });

  // If it has technical boundaries, also create a contract
  if (hasTechnicalBoundary) {
    contracts.push({
      name: `${principle.id}-boundary`,
      scope: { paths: ['/'], tags: [] } as ContractScope,
      content: body.slice(0, 1000),
      verified_at: now,
      locked: true,
      owner: 'speckit-bridge',
    });
  }
}

/**
 * Parse a component spec markdown file and extract requirements as contracts
 * and edge cases as gotchas.
 */
export function parseComponentSpec(content: string, specName: string): {
  contracts: Contract[];
  gotchas: Gotcha[];
} {
  const contracts: Contract[] = [];
  const gotchas: Gotcha[] = [];
  const now = new Date().toISOString();

  const lines = content.split('\n');
  let currentSection = '';
  let reqIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect section headers
    const sectionMatch = line.match(/^#{2,3}\s+(.+)$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim().toLowerCase();
      continue;
    }

    // Extract requirements from functional requirements or requirements sections
    if (currentSection.includes('requirement') || currentSection.includes('functional')) {
      const reqMatch = line.match(/^[-*]\s+(.+)$/);
      if (reqMatch) {
        reqIndex++;
        contracts.push({
          name: `FR-${specName}-${String(reqIndex).padStart(3, '0')}`,
          scope: { paths: [], tags: [specName] } as ContractScope,
          content: reqMatch[1].trim(),
          verified_at: now,
          locked: false,
          owner: 'speckit-bridge',
        });
      }
    }

    // Extract edge cases / gotchas
    if (currentSection.includes('edge case') || currentSection.includes('gotcha') || currentSection.includes('caveat')) {
      const gotchaMatch = line.match(/^[-*]\s+(.+)$/);
      if (gotchaMatch) {
        gotchas.push({
          text: gotchaMatch[1].trim(),
          tags: [specName],
          verified_at: now,
          locked: false,
        });
      }
    }
  }

  return { contracts, gotchas };
}

/**
 * Import a constitution file into the root .ctx file as locked decisions and contracts.
 */
export function importConstitution(
  repoRoot: string,
  constitutionPath: string,
  dryRun = false,
): ImportResult {
  const fullPath = constitutionPath.startsWith('/')
    ? constitutionPath
    : join(repoRoot, constitutionPath);

  if (!existsSync(fullPath)) {
    throw new Error(`Constitution file not found: ${fullPath}`);
  }

  const content = readFileSync(fullPath, 'utf-8');
  const { decisions, contracts } = parseConstitution(content);

  const result: ImportResult = {
    decisions: decisions.length,
    contracts: contracts.length,
    gotchas: 0,
    files_updated: [],
  };

  if (dryRun) {
    return result;
  }

  const rootCtxPath = join(repoRoot, '.ctx');
  let ctx: CtxFile;

  if (existsSync(rootCtxPath)) {
    const parsed = parseCtxFile(readFileSync(rootCtxPath, 'utf-8'));
    ctx = parsed.ctx;
  } else {
    ctx = createEmptyCtx('Project root context');
  }

  const before = { ...ctx };

  // Merge decisions: replace existing CONST- prefixed, keep non-CONST- ones
  const existingNonConst = ctx.decisions.filter((d) => !d.id.startsWith('CONST-'));
  ctx = { ...ctx, decisions: [...existingNonConst, ...decisions] };

  // Merge contracts: replace existing CONST- prefixed, keep non-CONST- ones
  const existingNonConstContracts = ctx.contracts.filter((c) => !c.name.startsWith('CONST-'));
  ctx = { ...ctx, contracts: [...existingNonConstContracts, ...contracts] };

  // Bump version
  const diffSummary = generateDiffSummary(before, ctx);
  ctx = bumpVersion(ctx, {
    author: 'speckit-bridge',
    reason: 'Import constitution principles',
    diff_summary: diffSummary,
  });

  writeFileSync(rootCtxPath, serializeCtxFile(ctx), 'utf-8');
  result.files_updated.push(relative(repoRoot, rootCtxPath));

  return result;
}

/**
 * Import component specs from a directory into corresponding .ctx files.
 */
export function importSpecs(
  repoRoot: string,
  specsDir: string,
  dryRun = false,
): ImportResult {
  const fullSpecsDir = specsDir.startsWith('/')
    ? specsDir
    : join(repoRoot, specsDir);

  if (!existsSync(fullSpecsDir)) {
    throw new Error(`Specs directory not found: ${fullSpecsDir}`);
  }

  const result: ImportResult = {
    decisions: 0,
    contracts: 0,
    gotchas: 0,
    files_updated: [],
  };

  const specFiles = readdirSync(fullSpecsDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => join(fullSpecsDir, f));

  for (const specFile of specFiles) {
    const stat = statSync(specFile);
    if (!stat.isFile()) continue;

    const content = readFileSync(specFile, 'utf-8');
    const specName = specFile.replace(/\.md$/, '').split('/').pop() || 'unknown';
    const { contracts, gotchas } = parseComponentSpec(content, specName);

    result.contracts += contracts.length;
    result.gotchas += gotchas.length;

    if (dryRun || (contracts.length === 0 && gotchas.length === 0)) {
      continue;
    }

    // Find or create .ctx file in the directory closest to the spec subject
    const targetCtxPath = join(repoRoot, '.ctx');
    let ctx: CtxFile;

    if (existsSync(targetCtxPath)) {
      const parsed = parseCtxFile(readFileSync(targetCtxPath, 'utf-8'));
      ctx = parsed.ctx;
    } else {
      ctx = createEmptyCtx(`Context for ${specName}`);
    }

    const before = { ...ctx };

    // Merge contracts: replace FR- prefixed with same spec name, keep others
    const prefix = `FR-${specName}-`;
    const existingOther = ctx.contracts.filter((c) => !c.name.startsWith(prefix));
    ctx = { ...ctx, contracts: [...existingOther, ...contracts] };

    // Merge gotchas: add new ones, avoid duplicates by text
    const existingTexts = new Set(ctx.gotchas.map((g) => g.text));
    const newGotchas = gotchas.filter((g) => !existingTexts.has(g.text));
    ctx = { ...ctx, gotchas: [...ctx.gotchas, ...newGotchas] };

    // Bump version
    const diffSummary = generateDiffSummary(before, ctx);
    ctx = bumpVersion(ctx, {
      author: 'speckit-bridge',
      reason: `Import spec: ${specName}`,
      diff_summary: diffSummary,
    });

    writeFileSync(targetCtxPath, serializeCtxFile(ctx), 'utf-8');
    const relPath = relative(repoRoot, targetCtxPath);
    if (!result.files_updated.includes(relPath)) {
      result.files_updated.push(relPath);
    }
  }

  return result;
}

function createEmptyCtx(summary: string): CtxFile {
  return {
    version: 1,
    summary,
    key_files: [],
    contracts: [],
    decisions: [],
    commands: {},
    gotchas: [],
    tags: [],
    refs: [],
    ignore: { never_read: [], never_log: [] },
    _history: [],
  };
}
