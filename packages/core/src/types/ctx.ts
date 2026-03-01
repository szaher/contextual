/** .ctx file schema v1 */
export interface CtxFile {
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

/** Current schema version */
export const CURRENT_CTX_VERSION = 1;
