/** Spec-kit bridge types for mapping, sync state, and operation results */

/** Transformation types for mapping spec-kit sections to .ctx sections */
export type TransformType = 'direct' | 'reshape' | 'aggregate' | 'split';

/** Sync direction for mapping rules */
export type SyncDirection = 'import_only' | 'export_only' | 'bidirectional';

/** A definition of how a spec-kit artifact section maps to a .ctx section */
export interface MappingRule {
  /** Section name in spec-kit artifact */
  spec_section: string;
  /** Target section in .ctx file */
  ctx_section: string;
  /** Transformation type */
  transform: TransformType;
  /** Prefix for generated IDs (e.g., "CONST-", "FR-") */
  id_prefix: string | null;
  /** Whether imported entries are locked */
  locked: boolean;
  /** Sync direction */
  direction: SyncDirection;
}

/** State of sync between a spec and .ctx file pair */
export interface SyncState {
  /** Path to spec-kit artifact */
  spec_path: string;
  /** Path to .ctx file */
  ctx_path: string;
  /** Last modification time of spec (ISO 8601) */
  spec_mtime: string;
  /** Last modification time of .ctx (ISO 8601) */
  ctx_mtime: string;
  /** Last sync timestamp (ISO 8601) */
  last_synced: string;
  /** Which side was source in last sync */
  direction: SyncDirection;
}

/** Result of an import operation */
export interface ImportResult {
  /** Number of decisions imported */
  decisions: number;
  /** Number of contracts imported */
  contracts: number;
  /** Number of gotchas imported */
  gotchas: number;
  /** Files that were updated */
  files_updated: string[];
}

/** Result of an export operation */
export interface ExportResult {
  /** Paths of exported spec files */
  exported_files: string[];
}

/** A constitution violation found during validation */
export interface ConstitutionViolation {
  /** Path to the .ctx file with the violation */
  ctx_path: string;
  /** Constitutional principle violated */
  principle: string;
  /** Description of the violation */
  violation: string;
  /** Severity level */
  severity: 'error' | 'warning';
}

/** Result of a constitution validation */
export interface ValidationResult {
  /** Whether all files are valid */
  valid: boolean;
  /** Violations found */
  violations: ConstitutionViolation[];
}

/** Result of a bidirectional sync */
export interface SyncResult {
  /** Number of files synced */
  synced: number;
  /** Number of conflicts detected */
  conflicts: number;
  /** Direction used for sync */
  direction_used: SyncDirection | 'bidirectional';
  /** .ctx files updated */
  files_updated: string[];
  /** Spec files updated */
  specs_updated: string[];
}
