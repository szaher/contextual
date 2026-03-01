/**
 * HTTP client for the CtxKit daemon API.
 * Used by both MCP tools and Claude Code hook handlers.
 */

const DEFAULT_DAEMON_URL = 'http://localhost:3742';
const REQUEST_TIMEOUT_MS = 10_000;

export interface DaemonClientOptions {
  baseUrl?: string;
}

export class DaemonClient {
  private baseUrl: string;

  constructor(options: DaemonClientOptions = {}) {
    this.baseUrl =
      options.baseUrl ||
      process.env.CTXKIT_API ||
      DEFAULT_DAEMON_URL;
  }

  /** Check if the daemon is running. */
  async healthCheck(): Promise<boolean> {
    try {
      const res = await this.fetch('/api/v1/health', { method: 'GET' });
      return res.ok;
    } catch {
      return false;
    }
  }

  // --- Sessions ---

  async createSession(params: {
    repo_path: string;
    working_dir: string;
    branch?: string;
    agent_id?: string;
    agent_config?: string;
  }): Promise<{ id: string; status: string; started_at: string }> {
    return this.post('/api/v1/sessions', params);
  }

  async listSessions(params?: {
    status?: string;
    repo_path?: string;
    limit?: number;
  }): Promise<{ sessions: unknown[]; total: number }> {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.repo_path) query.set('repo_path', params.repo_path);
    if (params?.limit) query.set('limit', String(params.limit));
    return this.get(`/api/v1/sessions?${query}`);
  }

  async getSession(sessionId: string): Promise<unknown> {
    return this.get(`/api/v1/sessions/${sessionId}`);
  }

  async closeSession(sessionId: string): Promise<unknown> {
    return this.patch(`/api/v1/sessions/${sessionId}`, {
      status: 'completed',
    });
  }

  // --- Context Pack ---

  async buildContextPack(params: {
    session_id: string;
    request_text: string;
    working_dir: string;
    touched_files?: string[];
    budget_tokens?: number;
  }): Promise<unknown> {
    return this.post('/api/v1/context-pack', params);
  }

  // --- Events ---

  async logEvent(
    sessionId: string,
    params: {
      event_type: string;
      tool_name: string;
      tool_input: Record<string, unknown>;
      tool_response?: Record<string, unknown>;
      exit_code?: number;
      duration_ms?: number;
    },
  ): Promise<{ event_id: string }> {
    return this.post(`/api/v1/sessions/${sessionId}/events`, params);
  }

  // --- Proposals ---

  async createProposal(params: {
    session_id?: string;
    ctx_path?: string;
    scope?: string;
    learned_facts?: string[];
    evidence_paths?: string[];
    provenance?: Record<string, unknown>;
  }): Promise<{ id: string; diff: string; summary: string }> {
    return this.post('/api/v1/proposals', params);
  }

  async applyProposal(
    proposalId: string,
  ): Promise<{ id: string; status: string; audit_id: string }> {
    return this.post(`/api/v1/proposals/${proposalId}/apply`, {});
  }

  async rejectProposal(
    proposalId: string,
  ): Promise<{ id: string; status: string }> {
    return this.patch(`/api/v1/proposals/${proposalId}`, {
      status: 'rejected',
    });
  }

  async listProposals(params?: {
    status?: string;
    limit?: number;
  }): Promise<{ proposals: unknown[]; total: number }> {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.limit) query.set('limit', String(params.limit));
    return this.get(`/api/v1/proposals?${query}`);
  }

  // --- Config (Policy) ---

  async getConfig(params: {
    cwd: string;
    repo_root?: string;
  }): Promise<unknown> {
    const query = new URLSearchParams();
    query.set('cwd', params.cwd);
    if (params.repo_root) query.set('repo_root', params.repo_root);
    return this.get(`/api/v1/config?${query}`);
  }

  async validateConfig(config: Record<string, unknown>): Promise<{
    valid: boolean;
    warnings: unknown[];
    errors: unknown[];
  }> {
    return this.post('/api/v1/config/validate', { config });
  }

  // --- Memory ---

  async searchMemory(params: {
    query: string;
    cwd: string;
    repo_root?: string;
    limit?: number;
  }): Promise<{ results: unknown[]; total: number }> {
    const query = new URLSearchParams();
    query.set('query', params.query);
    query.set('cwd', params.cwd);
    if (params.repo_root) query.set('repo_root', params.repo_root);
    if (params.limit) query.set('limit', String(params.limit));
    return this.get(`/api/v1/memory/search?${query}`);
  }

  // --- Internal HTTP helpers ---

  private async fetch(path: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS,
    );

    try {
      const url = `${this.baseUrl}${path}`;
      return await fetch(url, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async get<T>(path: string): Promise<T> {
    const res = await this.fetch(path, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw await this.createError(res);
    }
    return res.json() as Promise<T>;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw await this.createError(res);
    }
    return res.json() as Promise<T>;
  }

  private async patch<T>(path: string, body: unknown): Promise<T> {
    const res = await this.fetch(path, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw await this.createError(res);
    }
    return res.json() as Promise<T>;
  }

  private async createError(res: Response): Promise<DaemonApiError> {
    let detail: string;
    try {
      const body = await res.json() as { error?: { message?: string } };
      detail = body.error?.message || res.statusText;
    } catch {
      detail = res.statusText;
    }
    return new DaemonApiError(res.status, detail);
  }
}

export class DaemonApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(`Daemon API error (${statusCode}): ${message}`);
    this.name = 'DaemonApiError';
  }
}

/** Error message shown when daemon is unreachable. */
export const DAEMON_UNAVAILABLE_MESSAGE =
  'CtxKit daemon is not running. Start it with: ctxkit daemon start';
