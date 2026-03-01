const BASE_URL = '/api/v1';

// Shared types
export interface Session {
  id: string;
  agent_id: string | null;
  status: string;
  request_count: number;
  started_at: string;
  ended_at: string | null;
  repo_path: string;
  branch: string | null;
  events?: SessionEvent[];
}

export interface SessionEvent {
  id: string;
  request_text: string;
  token_count: number;
  budget: number;
  deep_read: string | null;
  created_at: string;
}

export interface Proposal {
  id: string;
  ctx_path: string;
  status: string;
  diff_content?: string;
}

export interface AuditEntry {
  id: string;
  ctx_path: string;
  change_type: string;
  initiated_by: string;
  reason: string;
  created_at: string;
}

export interface HealthStatus {
  status: string;
  uptime_seconds: number;
}

export interface ContextPackPreview {
  pack: Record<string, unknown>;
}

async function fetchJSON<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }
  return res.json();
}

// Sessions
export function listSessions(params?: { status?: string; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.limit) qs.set('limit', String(params.limit));
  return fetchJSON<{ sessions: Session[]; total: number }>(`/sessions?${qs}`);
}

export function getSession(id: string) {
  return fetchJSON<Session>(`/sessions/${id}`);
}

export function endSession(id: string) {
  return fetchJSON<Session>(`/sessions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'completed' }),
  });
}

// Context Pack
export function previewContextPack(request: string, cwd: string, budget?: number) {
  const qs = new URLSearchParams({ request, cwd });
  if (budget) qs.set('budget', String(budget));
  return fetchJSON<ContextPackPreview>(`/context-pack/preview?${qs}`);
}

// Proposals
export function listProposals(params?: { status?: string; ctx_path?: string }) {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.ctx_path) qs.set('ctx_path', params.ctx_path);
  return fetchJSON<{ proposals: Proposal[]; total: number }>(`/proposals?${qs}`);
}

export function approveProposal(id: string) {
  return fetchJSON<Proposal>(`/proposals/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'approved' }),
  });
}

export function rejectProposal(id: string) {
  return fetchJSON<Proposal>(`/proposals/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'rejected' }),
  });
}

export function applyProposal(id: string) {
  return fetchJSON<Proposal>(`/proposals/${id}/apply`, { method: 'POST' });
}

// Audit
export function queryAudit(params?: { ctx_path?: string; from?: string; to?: string; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.ctx_path) qs.set('ctx_path', params.ctx_path);
  if (params?.from) qs.set('from', params.from);
  if (params?.to) qs.set('to', params.to);
  if (params?.limit) qs.set('limit', String(params.limit));
  return fetchJSON<{ entries: AuditEntry[]; total: number }>(`/audit?${qs}`);
}

// Health
export function getHealth() {
  return fetchJSON<HealthStatus>('/health');
}
