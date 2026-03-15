/** Activity event types for tracking context-related actions during agent sessions */

/** Event type categories for activity tracking */
export type ActivityEventType =
  | 'SELECT'
  | 'READ'
  | 'STALE'
  | 'PROPOSE'
  | 'UPDATE'
  | 'CONFLICT'
  | 'RESOLVE'
  | 'BOOTSTRAP'
  | 'INDEX_REGEN'
  | 'LOCK_ACQUIRE'
  | 'LOCK_RELEASE';

/** A record of a context-related action during an agent session */
export interface ActivityEvent {
  /** Unique event identifier */
  id: string;
  /** Foreign key to sessions table */
  session_id: string;
  /** Event category */
  event_type: ActivityEventType;
  /** Related .ctx file path */
  ctx_path: string | null;
  /** Agent that triggered the event */
  agent_id: string | null;
  /** Event-specific metadata (JSON-serializable) */
  details: Record<string, unknown> | null;
  /** When the event occurred (ISO 8601) */
  created_at: string;
}
