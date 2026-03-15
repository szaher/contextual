/** History and versioning types for .ctx file change tracking */
/** A record of a single version change to a .ctx file */
export interface HistoryEntry {
    /** Version number this entry was created at */
    version: number;
    /** When the change occurred (ISO 8601) */
    timestamp: string;
    /** Who made the change (agent:<model-id> or developer:<username>) */
    author: string;
    /** Agent session ID (null for developer edits) */
    session_id: string | null;
    /** Why the change was made (max 200 chars) */
    reason: string;
    /** SHA-256 of .ctx content at this version */
    checksum: string;
    /** Human-readable change summary (e.g., "+2 key_files, ~1 contract") */
    diff_summary: string;
}
/** A diff of changes between sections of a .ctx file */
export interface SectionDiff {
    /** Section name (key_files, contracts, decisions, etc.) */
    section: string;
    /** Type of change */
    type: 'added' | 'removed' | 'modified';
    /** Affected entry identifiers */
    entries: string[];
}
/** Structured diff between two versions of a .ctx file */
export interface CtxDiff {
    /** Starting version */
    from_version: number;
    /** Ending version */
    to_version: number;
    /** Per-section changes */
    sections: SectionDiff[];
    /** Human-readable summary */
    summary: string;
}
/** Maximum number of inline history entries before archiving */
export declare const MAX_INLINE_HISTORY = 20;
//# sourceMappingURL=history.d.ts.map