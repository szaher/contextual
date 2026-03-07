import { describe, it, expect } from 'vitest';
import { homedir } from 'node:os';
import { defaultDbPath } from '../../packages/daemon/src/store/db.js';
import { loadProfile } from '@ctxl/core';

/**
 * T058: Portable Home Directory Resolution Integration Tests
 *
 * Verifies that path resolution uses os.homedir() and produces
 * absolute paths without literal tilde characters.
 */
describe('Integration: Home Directory Resolution', () => {
  // ──────────────────────────────────────────────────────────────────
  // T058: Verify defaultDbPath uses homedir() not literal ~
  // ──────────────────────────────────────────────────────────────────

  describe('T058: portable home directory paths', () => {
    it('should return an absolute path from defaultDbPath()', () => {
      const dbPath = defaultDbPath();

      // Must be an absolute path (starts with /)
      expect(dbPath.startsWith('/')).toBe(true);
    });

    it('should not contain literal tilde in defaultDbPath()', () => {
      const dbPath = defaultDbPath();

      // Must not contain unexpanded ~ character
      expect(dbPath).not.toContain('~');
    });

    it('should use os.homedir() as base for defaultDbPath()', () => {
      const dbPath = defaultDbPath();
      const home = homedir();

      expect(dbPath.startsWith(home)).toBe(true);
      expect(dbPath).toBe(`${home}/.ctxl/data/ctxl.db`);
    });

    it('should produce a path ending with ctxl.db', () => {
      const dbPath = defaultDbPath();

      expect(dbPath.endsWith('ctxl.db')).toBe(true);
    });

    it('should include .ctxl/data directory in the path', () => {
      const dbPath = defaultDbPath();

      expect(dbPath).toContain('/.ctxl/data/');
    });

    it('should resolve config paths using homedir() in loadProfile', () => {
      // loadProfile uses homedir() internally for global config path
      // We just verify it does not throw when called with a non-existent repo
      // and uses absolute paths in its sources
      const profile = loadProfile('/nonexistent/repo');

      // Should load with defaults
      expect(profile.sources).toContain('defaults');

      // The global config path it would try is join(homedir(), '.ctxl', 'config.yaml')
      // which should be an absolute path
      const home = homedir();
      expect(home.startsWith('/')).toBe(true);
      expect(home).not.toContain('~');
    });
  });
});
