import { describe, it, expect } from 'vitest';
import { detectSecrets, redactSecrets, containsSecrets } from '@ctxl/core';

/**
 * T050: Secret Detection Integration Tests
 *
 * Verifies that detectSecrets() finds ALL secret matches per line,
 * including multiple occurrences of the same pattern on a single line.
 */
describe('Integration: Secret Detection — Multi-Match', () => {
  // ──────────────────────────────────────────────────────────────────
  // T050: Multiple secrets on the same line
  // ──────────────────────────────────────────────────────────────────

  describe('T050: detect all secret matches per line', () => {
    it('should detect two GitHub tokens on the same line', () => {
      const line = 'token1=ghp_abcdefghijklmnopqrstuvwxyz0123456789 token2=ghp_zyxwvutsrqponmlkjihgfedcba9876543210';
      const matches = detectSecrets(line);

      const ghTokenMatches = matches.filter((m) => m.name === 'github_token');
      expect(ghTokenMatches.length).toBe(2);
      expect(ghTokenMatches[0].line).toBe(1);
      expect(ghTokenMatches[1].line).toBe(1);
      // Verify they have different index positions
      expect(ghTokenMatches[0].index).not.toBe(ghTokenMatches[1].index);
    });

    it('should detect two AWS access key IDs on the same line', () => {
      const line = 'key1=AKIAIOSFODNN7EXAMPLE key2=AKIAI44QH8DHBEXAMPLE';
      const matches = detectSecrets(line);

      const awsMatches = matches.filter((m) => m.name === 'aws_access_key');
      expect(awsMatches.length).toBe(2);
      expect(awsMatches[0].line).toBe(1);
    });

    it('should detect secrets of different types on the same line', () => {
      const line = 'AKIAIOSFODNN7EXAMPLE Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkw';
      const matches = detectSecrets(line);

      const types = new Set(matches.map((m) => m.name));
      expect(types.has('aws_access_key')).toBe(true);
      expect(types.has('bearer_token')).toBe(true);
    });

    it('should detect secrets across multiple lines', () => {
      const text = `line1: AKIAIOSFODNN7EXAMPLE
line2: ghp_abcdefghijklmnopqrstuvwxyz0123456789
line3: no secrets here
line4: -----BEGIN PRIVATE KEY-----`;

      const matches = detectSecrets(text);

      expect(matches.length).toBeGreaterThanOrEqual(3);
      expect(matches.find((m) => m.line === 1 && m.name === 'aws_access_key')).toBeDefined();
      expect(matches.find((m) => m.line === 2 && m.name === 'github_token')).toBeDefined();
      expect(matches.find((m) => m.line === 4 && m.name === 'private_key')).toBeDefined();
    });

    it('should return correct index and length for each match', () => {
      const token = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789';
      const line = `prefix ${token} suffix`;
      const matches = detectSecrets(line);

      const ghMatch = matches.find((m) => m.name === 'github_token');
      expect(ghMatch).toBeDefined();
      expect(ghMatch!.index).toBe(7); // "prefix " is 7 chars
      expect(ghMatch!.length).toBe(token.length);
    });

    it('should return empty array for text with no secrets', () => {
      const text = 'This is a normal line with no secrets\nJust some code here';
      const matches = detectSecrets(text);
      expect(matches).toHaveLength(0);
    });

    it('should detect PEM private key markers', () => {
      const text = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAK...';
      const matches = detectSecrets(text);

      const pemMatch = matches.find((m) => m.name === 'private_key');
      expect(pemMatch).toBeDefined();
      expect(pemMatch!.line).toBe(1);
    });

    it('should detect connection strings', () => {
      const text = 'postgres://admin:password123@db.example.com:5432/mydb';
      const matches = detectSecrets(text);

      const connMatch = matches.find((m) => m.name === 'connection_string');
      expect(connMatch).toBeDefined();
    });
  });

  describe('redactSecrets and containsSecrets', () => {
    it('should redact all occurrences of secrets in text', () => {
      const text = 'key=AKIAIOSFODNN7EXAMPLE and token=ghp_abcdefghijklmnopqrstuvwxyz0123456789';
      const redacted = redactSecrets(text);

      expect(redacted).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(redacted).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz0123456789');
      expect(redacted).toContain('[REDACTED:aws_access_key]');
      expect(redacted).toContain('[REDACTED:github_token]');
    });

    it('should correctly report containsSecrets for text with secrets', () => {
      expect(containsSecrets('AKIAIOSFODNN7EXAMPLE')).toBe(true);
      expect(containsSecrets('no secrets here')).toBe(false);
    });
  });
});
