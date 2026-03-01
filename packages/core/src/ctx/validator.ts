import type { CtxFile } from '../types/ctx.js';
import { CURRENT_CTX_VERSION } from '../types/ctx.js';

export interface ValidationError {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Validate a parsed CtxFile for structural correctness.
 * Returns an array of validation errors/warnings.
 */
export function validateCtxFile(ctx: CtxFile): ValidationError[] {
  const errors: ValidationError[] = [];

  // Version check
  if (ctx.version < 1 || ctx.version > CURRENT_CTX_VERSION) {
    errors.push({
      path: 'version',
      message: `Unknown version ${ctx.version}. Expected 1-${CURRENT_CTX_VERSION}.`,
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

  return errors;
}
