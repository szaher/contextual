import type { CtxFile } from '../types/ctx.js';
/**
 * Compute SHA-256 checksum of .ctx content, excluding the _history section.
 * Returns the checksum in the format "sha256:<64-hex-chars>".
 */
export declare function computeChecksum(ctx: CtxFile): string;
/**
 * Compute SHA-256 checksum from raw .ctx file content string.
 * Strips the _history section before hashing for consistency.
 */
export declare function computeChecksumFromString(content: string): string;
/**
 * Validate a checksum string format.
 */
export declare function isValidChecksum(checksum: string): boolean;
//# sourceMappingURL=checksum.d.ts.map