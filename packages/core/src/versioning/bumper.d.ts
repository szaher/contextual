import type { CtxFile } from '../types/ctx.js';
export interface BumpOptions {
    /** Who made the change (agent:<model-id> or developer:<username>) */
    author: string;
    /** Why the change was made (max 200 chars) */
    reason: string;
    /** Agent session ID (null for developer edits) */
    session_id?: string | null;
    /** Pre-computed diff summary. If not provided, will be empty. */
    diff_summary?: string;
}
/**
 * Increment the version of a .ctx file and prepend a new HistoryEntry.
 * Returns the updated CtxFile with the new version and history entry.
 */
export declare function bumpVersion(ctx: CtxFile, options: BumpOptions): CtxFile;
/**
 * Generate a diff_summary string from comparing two CtxFile objects.
 * Format: "+N section, ~N section, -N section"
 */
export declare function generateDiffSummary(before: CtxFile, after: CtxFile): string;
//# sourceMappingURL=bumper.d.ts.map