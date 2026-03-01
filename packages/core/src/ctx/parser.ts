import yaml from 'js-yaml';
import type { CtxFile, KeyFile, Contract, Decision, Gotcha, CtxRef, IgnorePolicy } from '../types/ctx.js';

/**
 * Parse a .ctx YAML string into a typed CtxFile object.
 * Applies sensible defaults for missing optional fields.
 */
export function parseCtxFile(content: string): CtxFile {
  const raw = yaml.load(content) as Record<string, unknown>;

  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid .ctx file: expected a YAML mapping');
  }

  return {
    version: typeof raw.version === 'number' ? raw.version : 1,
    summary: typeof raw.summary === 'string' ? raw.summary : '',
    key_files: Array.isArray(raw.key_files)
      ? raw.key_files.map(normalizeKeyFile)
      : [],
    contracts: Array.isArray(raw.contracts)
      ? raw.contracts.map(normalizeContract)
      : [],
    decisions: Array.isArray(raw.decisions)
      ? raw.decisions.map(normalizeDecision)
      : [],
    commands: isStringRecord(raw.commands) ? raw.commands : {},
    gotchas: Array.isArray(raw.gotchas)
      ? raw.gotchas.map(normalizeGotcha)
      : [],
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    refs: Array.isArray(raw.refs) ? raw.refs.map(normalizeRef) : [],
    ignore: normalizeIgnore(raw.ignore),
  };
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

function normalizeKeyFile(raw: unknown): KeyFile {
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

function normalizeContract(raw: unknown): Contract {
  const r = raw as Record<string, unknown>;
  const scope = r.scope as Record<string, unknown> | undefined;
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

function normalizeDecision(raw: unknown): Decision {
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

function normalizeGotcha(raw: unknown): Gotcha {
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
