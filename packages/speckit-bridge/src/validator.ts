import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseCtxFile } from '@ctxkit/core';
import type { CtxFile } from '@ctxkit/core';
import type { ValidationResult, ConstitutionViolation } from './types.js';
import { parseConstitution } from './importer.js';

/** A constitutional principle extracted for validation */
interface Principle {
  id: string;
  title: string;
  keywords: string[];
  mustClauses: string[];
}

/**
 * Validate all .ctx files against a constitution.
 * Checks for compliance with constitutional principles.
 */
export function validateConstitution(
  repoRoot: string,
  constitutionPath: string,
): ValidationResult {
  const fullPath = constitutionPath.startsWith('/')
    ? constitutionPath
    : join(repoRoot, constitutionPath);

  if (!existsSync(fullPath)) {
    throw new Error(`Constitution file not found: ${fullPath}`);
  }

  const content = readFileSync(fullPath, 'utf-8');
  const principles = extractPrinciples(content);
  const ctxFiles = findCtxFiles(repoRoot);
  const violations: ConstitutionViolation[] = [];

  for (const ctxPath of ctxFiles) {
    const ctxContent = readFileSync(ctxPath, 'utf-8');
    const { ctx } = parseCtxFile(ctxContent);
    const relPath = relative(repoRoot, ctxPath);

    // Check each principle
    for (const principle of principles) {
      const fileViolations = checkPrincipleCompliance(ctx, principle, relPath);
      violations.push(...fileViolations);
    }

    // Check for missing locked constitution decisions
    const constitutionDecisions = parseConstitution(content).decisions;
    const ctxDecisionIds = new Set(ctx.decisions.map((d: { id: string }) => d.id));

    // Only check root .ctx for constitution decisions
    if (relPath === '.ctx') {
      for (const constDec of constitutionDecisions) {
        if (!ctxDecisionIds.has(constDec.id)) {
          violations.push({
            ctx_path: relPath,
            principle: constDec.title,
            violation: `Missing constitution decision: ${constDec.id} (${constDec.title})`,
            severity: 'warning',
          });
        }
      }
    }
  }

  return {
    valid: violations.filter((v) => v.severity === 'error').length === 0,
    violations,
  };
}

function extractPrinciples(content: string): Principle[] {
  const principles: Principle[] = [];
  const lines = content.split('\n');
  let current: { id: string; title: string; content: string[] } | null = null;
  let index = 0;

  for (const line of lines) {
    const headingMatch = line.match(/^#{2,3}\s+(?:([IVXLCDM]+|[0-9]+)\.\s+)?(.+)$/);

    if (headingMatch) {
      if (current) {
        principles.push(buildPrinciple(current));
      }
      index++;
      current = {
        id: `CONST-${headingMatch[1] || String(index)}`,
        title: headingMatch[2].trim(),
        content: [],
      };
    } else if (current && line.trim().length > 0) {
      current.content.push(line);
    }
  }

  if (current) {
    principles.push(buildPrinciple(current));
  }

  return principles;
}

function buildPrinciple(raw: { id: string; title: string; content: string[] }): Principle {
  // Extract MUST/SHALL clauses
  const mustClauses: string[] = [];
  for (const line of raw.content) {
    if (/\bMUST\b|\bSHALL\b|\bREQUIRED\b/.test(line)) {
      mustClauses.push(line.replace(/^[-*]\s+/, '').trim());
    }
  }

  // Extract keywords from title and content
  const keywords = raw.title
    .toLowerCase()
    .split(/[\s,\-_]+/)
    .filter((w) => w.length > 3);

  return {
    id: raw.id,
    title: raw.title,
    keywords,
    mustClauses,
  };
}

function checkPrincipleCompliance(
  ctx: CtxFile,
  principle: Principle,
  ctxPath: string,
): ConstitutionViolation[] {
  const violations: ConstitutionViolation[] = [];

  // Check if any contract or decision explicitly contradicts a MUST clause
  for (const clause of principle.mustClauses) {
    const lowerClause = clause.toLowerCase();

    // Check for "local" principle violations (external service references)
    if (lowerClause.includes('local') || lowerClause.includes('private')) {
      for (const contract of ctx.contracts) {
        if (
          /external|remote|cloud|saas/i.test(contract.content) &&
          !contract.content.toLowerCase().includes('opt-in') &&
          !contract.content.toLowerCase().includes('optional')
        ) {
          violations.push({
            ctx_path: ctxPath,
            principle: principle.title,
            violation: `Contract '${contract.name}' references external service without opt-in gate`,
            severity: 'warning',
          });
        }
      }
    }

    // Check for unlocked decisions that should be locked (constitution principles)
    for (const decision of ctx.decisions) {
      if (decision.id.startsWith('CONST-') && !decision.locked) {
        violations.push({
          ctx_path: ctxPath,
          principle: principle.title,
          violation: `Constitution decision '${decision.id}' is not locked`,
          severity: 'error',
        });
      }
    }
  }

  return violations;
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
