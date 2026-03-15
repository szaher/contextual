import type { TrailerData } from './types.js';
import { redactSecrets } from '../redact/secrets.js';

/**
 * Format TrailerData into standard git trailer lines with Ctxkit-* prefix.
 * All values are redacted via redactSecrets() before formatting.
 * Returns empty string if neither sessionId nor files are present (no-op).
 */
export function formatTrailers(data: TrailerData): string {
  const hasSession = data.sessionId != null && data.sessionId.length > 0;
  const hasFiles = data.files != null && data.files.length > 0;

  // No-op: at least one of session or files must be present
  if (!hasSession && !hasFiles) {
    return '';
  }

  const lines: string[] = [];

  if (hasSession) {
    lines.push(`Ctxkit-Session: ${redactSecrets(data.sessionId!)}`);
  }

  if (hasFiles) {
    const fileList = data.files!.map((f) => redactSecrets(f)).join(', ');
    lines.push(`Ctxkit-Files: ${fileList}`);
  }

  if (data.entries != null && data.entries > 0) {
    lines.push(`Ctxkit-Entries: ${data.entries}`);
  }

  lines.push(`Ctxkit-Timestamp: ${redactSecrets(data.timestamp)}`);

  return lines.join('\n');
}
