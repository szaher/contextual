import type { HistoryEntry } from './history.js';

/** .ctx file schema v1/v2 */
export interface CtxFile {
  /** Content revision counter (1, 2, 3...) — v1 files start at 1 */
  version: number;
  summary: string;
  key_files: KeyFile[];
  contracts: Contract[];
  decisions: Decision[];
  commands: Record<string, string>;
  gotchas: Gotcha[];
  tags: string[];
  refs: CtxRef[];
  ignore: IgnorePolicy;
  /** Inline version history (max 20 entries, newest first). Optional for v1 compat. */
  _history?: HistoryEntry[];
}

export interface KeyFile {
  path: string;
  purpose: string;
  tags: string[];
  verified_at: string;
  locked: boolean;
  owner: string | null;
}

export interface Contract {
  name: string;
  scope: ContractScope;
  content: string;
  verified_at: string;
  locked: boolean;
  owner: string | null;
}

export interface ContractScope {
  paths: string[];
  tags: string[];
}

export interface Decision {
  id: string;
  title: string;
  status: 'accepted' | 'deprecated' | 'superseded';
  date: string;
  rationale: string;
  alternatives: Alternative[];
  verified_at: string;
  locked: boolean;
  owner: string | null;
}

export interface Alternative {
  name: string;
  reason_rejected: string;
}

export interface Gotcha {
  text: string;
  tags: string[];
  verified_at: string;
  locked: boolean;
}

export interface CtxRef {
  target: string;
  sections: string[];
  reason: string;
}

export interface IgnorePolicy {
  never_read: string[];
  never_log: string[];
}

/**
 * Current schema version.
 * Note: In v2, the version field on CtxFile is a content revision counter (1, 2, 3...),
 * not a schema version. This constant is kept for backward compatibility.
 */
export const CURRENT_CTX_VERSION = 1;
