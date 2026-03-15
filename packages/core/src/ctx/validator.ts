import type { CtxFile } from '../types/ctx.js';

export interface ValidationError {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

const CHECKSUM_PATTERN = /^sha256:[0-9a-f]{64}$/;
const AUTHOR_PATTERN = /^(agent:.+|developer:.+)$/;
const ISO_8601_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

/**
 * Validate a parsed CtxFile for structural correctness.
 * Returns an array of validation errors/warnings.
 */
export function validateCtxFile(ctx: CtxFile): ValidationError[] {
  const errors: ValidationError[] = [];

  // Version check — accept any positive integer (v2: content revision counter)
  if (!Number.isInteger(ctx.version) || ctx.version < 1) {
    errors.push({
      path: 'version',
      message: `Invalid version ${ctx.version}. Must be a positive integer.`,
      severity: 'error',
    });
  }

  // Summary required and length check
  if (!ctx.summary || ctx.summary.trim().length === 0) {
    errors.push({
      path: 'summary',
      message: 'Summary is required and must not be empty.',
      severity: 'error',
    });
  }

  // Key files: unique paths
  const keyFilePaths = new Set<string>();
  for (let i = 0; i < ctx.key_files.length; i++) {
    const kf = ctx.key_files[i];
    if (!kf.path) {
      errors.push({
        path: `key_files[${i}].path`,
        message: 'Key file path is required.',
        severity: 'error',
      });
    } else if (keyFilePaths.has(kf.path)) {
      errors.push({
        path: `key_files[${i}].path`,
        message: `Duplicate key file path: ${kf.path}`,
        severity: 'error',
      });
    } else {
      keyFilePaths.add(kf.path);
    }

    if (!kf.purpose) {
      errors.push({
        path: `key_files[${i}].purpose`,
        message: `Key file ${kf.path || i} is missing a purpose.`,
        severity: 'warning',
      });
    }
  }

  // Contracts: unique names
  const contractNames = new Set<string>();
  for (let i = 0; i < ctx.contracts.length; i++) {
    const c = ctx.contracts[i];
    if (!c.name) {
      errors.push({
        path: `contracts[${i}].name`,
        message: 'Contract name is required.',
        severity: 'error',
      });
    } else if (contractNames.has(c.name)) {
      errors.push({
        path: `contracts[${i}].name`,
        message: `Duplicate contract name: ${c.name}`,
        severity: 'error',
      });
    } else {
      contractNames.add(c.name);
    }

    if (!c.content) {
      errors.push({
        path: `contracts[${i}].content`,
        message: `Contract ${c.name || i} has no content.`,
        severity: 'warning',
      });
    }

    if (c.scope.paths.length === 0 && c.scope.tags.length === 0) {
      errors.push({
        path: `contracts[${i}].scope`,
        message: `Contract ${c.name || i} has no scope (paths or tags).`,
        severity: 'warning',
      });
    }
  }

  // Decisions: unique IDs
  const decisionIds = new Set<string>();
  for (let i = 0; i < ctx.decisions.length; i++) {
    const d = ctx.decisions[i];
    if (!d.id) {
      errors.push({
        path: `decisions[${i}].id`,
        message: 'Decision ID is required.',
        severity: 'error',
      });
    } else if (decisionIds.has(d.id)) {
      errors.push({
        path: `decisions[${i}].id`,
        message: `Duplicate decision ID: ${d.id}`,
        severity: 'error',
      });
    } else {
      decisionIds.add(d.id);
    }

    if (!d.title) {
      errors.push({
        path: `decisions[${i}].title`,
        message: `Decision ${d.id || i} is missing a title.`,
        severity: 'warning',
      });
    }
  }

  // Refs: valid target format
  for (let i = 0; i < ctx.refs.length; i++) {
    const ref = ctx.refs[i];
    if (!ref.target) {
      errors.push({
        path: `refs[${i}].target`,
        message: 'Reference target is required.',
        severity: 'error',
      });
    }
    if (ref.sections.length === 0) {
      errors.push({
        path: `refs[${i}].sections`,
        message: `Reference to ${ref.target || 'unknown'} has no sections specified.`,
        severity: 'warning',
      });
    }
  }

  // _history validation (v2)
  if (ctx._history) {
    validateHistory(ctx._history, errors);
  }

  return errors;
}

/**
 * Validate _history entries for v2 .ctx files.
 */
function validateHistory(history: unknown[], errors: ValidationError[]): void {
  if (!Array.isArray(history)) return;

  for (let i = 0; i < history.length; i++) {
    const entry = history[i] as Record<string, unknown>;
    const prefix = `_history[${i}]`;

    // version: positive integer
    if (!Number.isInteger(entry.version) || (entry.version as number) < 1) {
      errors.push({
        path: `${prefix}.version`,
        message: `History entry version must be a positive integer, got ${entry.version}.`,
        severity: 'error',
      });
    }

    // timestamp: ISO 8601
    if (typeof entry.timestamp !== 'string' || !ISO_8601_PATTERN.test(entry.timestamp)) {
      errors.push({
        path: `${prefix}.timestamp`,
        message: `History entry timestamp must be ISO 8601, got "${entry.timestamp}".`,
        severity: 'error',
      });
    }

    // author: agent:* or developer:*
    if (typeof entry.author !== 'string' || !AUTHOR_PATTERN.test(entry.author)) {
      errors.push({
        path: `${prefix}.author`,
        message: `History entry author must match agent:* or developer:*, got "${entry.author}".`,
        severity: 'error',
      });
    }

    // reason: ≤200 chars
    if (typeof entry.reason === 'string' && entry.reason.length > 200) {
      errors.push({
        path: `${prefix}.reason`,
        message: `History entry reason exceeds 200 characters (${entry.reason.length}).`,
        severity: 'error',
      });
    }

    // checksum: sha256:<64-hex>
    if (typeof entry.checksum === 'string' && !CHECKSUM_PATTERN.test(entry.checksum)) {
      errors.push({
        path: `${prefix}.checksum`,
        message: `History entry checksum must match sha256:<64-hex>, got "${entry.checksum}".`,
        severity: 'error',
      });
    }
  }
}
