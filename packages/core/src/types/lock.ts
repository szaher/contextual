/** Lock types for exclusive write access to .ctx files */

/** Information about an active lock on a .ctx file */
export interface LockInfo {
  /** Relative path to the locked .ctx file */
  path: string;
  /** Identity of the lock holder (agent:<model>:sess_<id> or developer:<username>) */
  holder: string;
  /** When the lock was acquired (ISO 8601) */
  acquired_at: string;
  /** When the lock auto-expires (ISO 8601) */
  expires_at: string;
  /** Type of operation being performed */
  operation: LockOperation;
}

/** Types of lock operations */
export type LockOperation = 'update' | 'resolve' | 'bootstrap' | 'migrate';

/** A handle to an acquired lock, used for release */
export interface LockHandle {
  /** The lock information */
  lock: LockInfo;
  /** Release this lock */
  release: () => Promise<void>;
}

/** Default lock TTL in milliseconds (5 minutes) */
export const DEFAULT_LOCK_TTL_MS = 5 * 60 * 1000;
