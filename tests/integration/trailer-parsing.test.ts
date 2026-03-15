import { describe, it, expect } from 'vitest';
import { formatTrailers, parseTrailers } from '@ctxkit/core';
import type { TrailerData } from '@ctxkit/core';

describe('Trailer Formatting and Parsing', () => {
  describe('formatTrailers', () => {
    it('formats all trailer fields correctly', () => {
      const data: TrailerData = {
        sessionId: 'sess_7d2f4a1b',
        files: ['src/auth/.ctx', 'src/api/.ctx'],
        entries: 3,
        timestamp: '2026-03-15T14:30:00Z',
      };
      const result = formatTrailers(data);
      expect(result).toContain('Ctxkit-Session: sess_7d2f4a1b');
      expect(result).toContain('Ctxkit-Files: src/auth/.ctx, src/api/.ctx');
      expect(result).toContain('Ctxkit-Entries: 3');
      expect(result).toContain('Ctxkit-Timestamp: 2026-03-15T14:30:00Z');
    });

    it('omits session trailer when sessionId is absent', () => {
      const data: TrailerData = {
        files: ['src/.ctx'],
        timestamp: '2026-03-15T14:30:00Z',
      };
      const result = formatTrailers(data);
      expect(result).not.toContain('Ctxkit-Session');
      expect(result).toContain('Ctxkit-Files: src/.ctx');
      expect(result).toContain('Ctxkit-Timestamp');
    });

    it('omits files trailer when files array is empty', () => {
      const data: TrailerData = {
        sessionId: 'sess_abc12345',
        timestamp: '2026-03-15T14:30:00Z',
      };
      const result = formatTrailers(data);
      expect(result).toContain('Ctxkit-Session');
      expect(result).not.toContain('Ctxkit-Files');
    });

    it('omits entries trailer when entries is 0 or absent', () => {
      const data: TrailerData = {
        sessionId: 'sess_abc12345',
        entries: 0,
        timestamp: '2026-03-15T14:30:00Z',
      };
      const result = formatTrailers(data);
      expect(result).not.toContain('Ctxkit-Entries');
    });

    it('returns empty string when no session and no files (no-op)', () => {
      const data: TrailerData = {
        timestamp: '2026-03-15T14:30:00Z',
      };
      const result = formatTrailers(data);
      expect(result).toBe('');
    });

    it('redacts secrets from trailer values', () => {
      const data: TrailerData = {
        sessionId: 'sess_7d2f4a1b',
        files: ['src/config-with-secret_key=SuperSecretValue12345678901234567890abcd/.ctx'],
        timestamp: '2026-03-15T14:30:00Z',
      };
      const result = formatTrailers(data);
      expect(result).toContain('[REDACTED:');
      expect(result).not.toContain('SuperSecretValue12345678901234567890abcd');
    });
  });

  describe('parseTrailers', () => {
    it('parses all trailer fields from a commit message', () => {
      const message = `fix: update auth flow

Refactored login handler.

Ctxkit-Session: sess_7d2f4a1b
Ctxkit-Files: src/auth/.ctx, src/api/.ctx
Ctxkit-Entries: 3
Ctxkit-Timestamp: 2026-03-15T14:30:00Z`;

      const result = parseTrailers(message);
      expect(result).not.toBeNull();
      expect(result!.sessionId).toBe('sess_7d2f4a1b');
      expect(result!.files).toEqual(['src/auth/.ctx', 'src/api/.ctx']);
      expect(result!.entries).toBe(3);
      expect(result!.timestamp).toBe('2026-03-15T14:30:00Z');
    });

    it('returns null when no Ctxkit-* trailers are present', () => {
      const message = `fix: simple bug fix

No context here.

Signed-off-by: Jane Dev <jane@example.com>`;

      const result = parseTrailers(message);
      expect(result).toBeNull();
    });

    it('handles missing optional fields', () => {
      const message = `feat: add feature

Ctxkit-Files: src/.ctx
Ctxkit-Timestamp: 2026-03-15T14:30:00Z`;

      const result = parseTrailers(message);
      expect(result).not.toBeNull();
      expect(result!.sessionId).toBeNull();
      expect(result!.files).toEqual(['src/.ctx']);
      expect(result!.entries).toBeNull();
    });

    it('handles trailers mixed with other git trailers', () => {
      const message = `fix: auth

Signed-off-by: Jane Dev <jane@example.com>
Ctxkit-Session: sess_abc12345
Co-authored-by: AI <ai@example.com>
Ctxkit-Timestamp: 2026-03-15T14:30:00Z`;

      const result = parseTrailers(message);
      expect(result).not.toBeNull();
      expect(result!.sessionId).toBe('sess_abc12345');
      expect(result!.timestamp).toBe('2026-03-15T14:30:00Z');
    });
  });

  describe('round-trip: format → parse', () => {
    it('produces identical data after format and parse', () => {
      const original: TrailerData = {
        sessionId: 'sess_deadbeef',
        files: ['src/auth/.ctx', 'lib/.ctx'],
        entries: 5,
        timestamp: '2026-03-15T14:30:00Z',
      };

      const formatted = formatTrailers(original);
      const parsed = parseTrailers(`feat: something\n\n${formatted}`);

      expect(parsed).not.toBeNull();
      expect(parsed!.sessionId).toBe(original.sessionId);
      expect(parsed!.files).toEqual(original.files);
      expect(parsed!.entries).toBe(original.entries);
      expect(parsed!.timestamp).toBe(original.timestamp);
    });
  });
});
