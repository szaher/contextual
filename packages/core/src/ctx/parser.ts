import yaml from 'js-yaml';
import type { CtxFile, KeyFile, Contract, Decision, Gotcha, CtxRef, IgnorePolicy } from '../types/ctx.js';

export interface ParseResult {
  ctx: CtxFile;
  warnings: string[];
}

/**
 * Parse a .ctx YAML string into a typed CtxFile object.
 * Applies sensible defaults for missing optional fields.
 * Returns warnings for type mismatches instead of throwing.
 */
export function parseCtxFile(content: string): ParseResult {
  const warnings: string[] = [];
  const raw = yaml.load(content);

  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid .ctx file: expected a YAML mapping');
  }

  const r = raw as Record<string, unknown>;

  if (r.key_files !== undefined && !Array.isArray(r.key_files)) {
    warnings.push(`Skipped key_files: expected array, got ${typeof r.key_files}`);
  }
  if (r.contracts !== undefined && !Array.isArray(r.contracts)) {
    warnings.push(`Skipped contracts: expected array, got ${typeof r.contracts}`);
  }
  if (r.decisions !== undefined && !Array.isArray(r.decisions)) {
    warnings.push(`Skipped decisions: expected array, got ${typeof r.decisions}`);
  }
  if (r.gotchas !== undefined && !Array.isArray(r.gotchas)) {
    warnings.push(`Skipped gotchas: expected array, got ${typeof r.gotchas}`);
  }
  if (r.tags !== undefined && !Array.isArray(r.tags)) {
    warnings.push(`Skipped tags: expected array, got ${typeof r.tags}`);
  }
  if (r.refs !== undefined && !Array.isArray(r.refs)) {
    warnings.push(`Skipped refs: expected array, got ${typeof r.refs}`);
  }
  if (r.commands !== undefined && !isStringRecord(r.commands)) {
    warnings.push(`Skipped commands: expected string record, got ${typeof r.commands}`);
  }

  const ctx: CtxFile = {
    version: typeof r.version === 'number' ? r.version : 1,
    summary: typeof r.summary === 'string' ? r.summary : '',
    key_files: Array.isArray(r.key_files)
      ? r.key_files.map((item, i) => normalizeKeyFile(item, warnings, i))
      : [],
    contracts: Array.isArray(r.contracts)
      ? r.contracts.map((item, i) => normalizeContract(item, warnings, i))
      : [],
    decisions: Array.isArray(r.decisions)
      ? r.decisions.map((item, i) => normalizeDecision(item, warnings, i))
      : [],
    commands: isStringRecord(r.commands) ? r.commands : {},
    gotchas: Array.isArray(r.gotchas)
      ? r.gotchas.map((item, i) => normalizeGotcha(item, warnings, i))
      : [],
    tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
    refs: Array.isArray(r.refs) ? r.refs.map(normalizeRef) : [],
    ignore: normalizeIgnore(r.ignore),
  };

  return { ctx, warnings };
}

/**
 * Serialize a CtxFile object to YAML string.
 */
export function serializeCtxFile(ctx: CtxFile): string {
  return yaml.dump(ctx, {
    lineWidth: 80,
    noRefs: true,
    sortKeys: false,
    quotingType: '"',
  });
}

function normalizeKeyFile(raw: unknown, warnings: string[], index: number): KeyFile {
  if (!raw || typeof raw !== 'object') {
    warnings.push(`Skipped key_files[${index}]: expected object, got ${typeof raw}`);
    return { path: '', purpose: '', tags: [], verified_at: '', locked: false, owner: null };
  }
  const r = raw as Record<string, unknown>;
  return {
    path: String(r.path ?? ''),
    purpose: String(r.purpose ?? ''),
    tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
    verified_at: String(r.verified_at ?? ''),
    locked: Boolean(r.locked),
    owner: r.owner != null ? String(r.owner) : null,
  };
}

function normalizeContract(raw: unknown, warnings: string[], index: number): Contract {
  if (!raw || typeof raw !== 'object') {
    warnings.push(`Skipped contracts[${index}]: expected object, got ${typeof raw}`);
    return { name: '', scope: { paths: [], tags: [] }, content: '', verified_at: '', locked: false, owner: null };
  }
  const r = raw as Record<string, unknown>;
  const scope = r.scope && typeof r.scope === 'object' ? r.scope as Record<string, unknown> : undefined;
  if (r.scope !== undefined && (!r.scope || typeof r.scope !== 'object')) {
    warnings.push(`Skipped contracts[${index}].scope: expected object, got ${typeof r.scope}`);
  }
  return {
    name: String(r.name ?? ''),
    scope: {
      paths: Array.isArray(scope?.paths) ? scope.paths.map(String) : [],
      tags: Array.isArray(scope?.tags) ? scope.tags.map(String) : [],
    },
    content: String(r.content ?? ''),
    verified_at: String(r.verified_at ?? ''),
    locked: Boolean(r.locked),
    owner: r.owner != null ? String(r.owner) : null,
  };
}

function normalizeDecision(raw: unknown, warnings: string[], index: number): Decision {
  if (!raw || typeof raw !== 'object') {
    warnings.push(`Skipped decisions[${index}]: expected object, got ${typeof raw}`);
    return { id: '', title: '', status: 'accepted', date: '', rationale: '', alternatives: [], verified_at: '', locked: false, owner: null };
  }
  const r = raw as Record<string, unknown>;
  return {
    id: String(r.id ?? ''),
    title: String(r.title ?? ''),
    status: (['accepted', 'deprecated', 'superseded'].includes(String(r.status))
      ? String(r.status)
      : 'accepted') as 'accepted' | 'deprecated' | 'superseded',
    date: String(r.date ?? ''),
    rationale: String(r.rationale ?? ''),
    alternatives: Array.isArray(r.alternatives)
      ? r.alternatives.map((a: unknown) => {
          if (!a || typeof a !== 'object') return { name: '', reason_rejected: '' };
          const alt = a as Record<string, unknown>;
          return {
            name: String(alt.name ?? ''),
            reason_rejected: String(alt.reason_rejected ?? ''),
          };
        })
      : [],
    verified_at: String(r.verified_at ?? ''),
    locked: Boolean(r.locked),
    owner: r.owner != null ? String(r.owner) : null,
  };
}

function normalizeGotcha(raw: unknown, warnings: string[], index: number): Gotcha {
  if (!raw || typeof raw !== 'object') {
    warnings.push(`Skipped gotchas[${index}]: expected object, got ${typeof raw}`);
    return { text: '', tags: [], verified_at: '', locked: false };
  }
  const r = raw as Record<string, unknown>;
  return {
    text: String(r.text ?? ''),
    tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
    verified_at: String(r.verified_at ?? ''),
    locked: Boolean(r.locked),
  };
}

function normalizeRef(raw: unknown): CtxRef {
  const r = raw as Record<string, unknown>;
  return {
    target: String(r.target ?? ''),
    sections: Array.isArray(r.sections) ? r.sections.map(String) : [],
    reason: String(r.reason ?? ''),
  };
}

function normalizeIgnore(raw: unknown): IgnorePolicy {
  if (!raw || typeof raw !== 'object') {
    return { never_read: [], never_log: [] };
  }
  const r = raw as Record<string, unknown>;
  return {
    never_read: Array.isArray(r.never_read) ? r.never_read.map(String) : [],
    never_log: Array.isArray(r.never_log) ? r.never_log.map(String) : [],
  };
}

function isStringRecord(v: unknown): v is Record<string, string> {
  if (!v || typeof v !== 'object') return false;
  return Object.values(v as Record<string, unknown>).every(
    (val) => typeof val === 'string',
  );
}
