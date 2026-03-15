import { createHash } from 'node:crypto';
import yaml from 'js-yaml';
/**
 * Compute SHA-256 checksum of .ctx content, excluding the _history section.
 * Returns the checksum in the format "sha256:<64-hex-chars>".
 */
export function computeChecksum(ctx) {
    // Build object without _history for deterministic hashing
    const hashable = {
        version: ctx.version,
        summary: ctx.summary,
        key_files: ctx.key_files,
        contracts: ctx.contracts,
        decisions: ctx.decisions,
        commands: ctx.commands,
        gotchas: ctx.gotchas,
        tags: ctx.tags,
        refs: ctx.refs,
        ignore: ctx.ignore,
    };
    const content = yaml.dump(hashable, {
        lineWidth: 80,
        noRefs: true,
        sortKeys: true, // deterministic key order for consistent hashing
        quotingType: '"',
    });
    const hash = createHash('sha256').update(content, 'utf8').digest('hex');
    return `sha256:${hash}`;
}
/**
 * Compute SHA-256 checksum from raw .ctx file content string.
 * Strips the _history section before hashing for consistency.
 */
export function computeChecksumFromString(content) {
    const raw = yaml.load(content);
    if (!raw || typeof raw !== 'object') {
        // Hash raw content as fallback
        const hash = createHash('sha256').update(content, 'utf8').digest('hex');
        return `sha256:${hash}`;
    }
    const r = raw;
    // Remove _history before hashing
    const { _history, ...rest } = r; // eslint-disable-line @typescript-eslint/no-unused-vars
    const normalized = yaml.dump(rest, {
        lineWidth: 80,
        noRefs: true,
        sortKeys: true,
        quotingType: '"',
    });
    const hash = createHash('sha256').update(normalized, 'utf8').digest('hex');
    return `sha256:${hash}`;
}
/**
 * Validate a checksum string format.
 */
export function isValidChecksum(checksum) {
    return /^sha256:[0-9a-f]{64}$/.test(checksum);
}
//# sourceMappingURL=checksum.js.map