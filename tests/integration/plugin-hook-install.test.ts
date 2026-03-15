import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadProfile } from '@ctxkit/core';

describe('Plugin Hook Auto-Install (US2)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxl-plugin-hooks-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Hook policy configuration', () => {
    it('defaults to "prompt" when no config exists', () => {
      const profile = loadProfile(tmpDir);
      expect(profile.git_hooks.auto_install).toBe('prompt');
    });

    it('reads "auto" policy from workspace config', () => {
      mkdirSync(join(tmpDir, '.ctxl'), { recursive: true });
      writeFileSync(
        join(tmpDir, '.ctxl', 'config.yaml'),
        'git_hooks:\n  auto_install: auto\n',
        'utf-8',
      );

      const profile = loadProfile(tmpDir);
      expect(profile.git_hooks.auto_install).toBe('auto');
    });

    it('reads "skip" policy from workspace config', () => {
      mkdirSync(join(tmpDir, '.ctxl'), { recursive: true });
      writeFileSync(
        join(tmpDir, '.ctxl', 'config.yaml'),
        'git_hooks:\n  auto_install: skip\n',
        'utf-8',
      );

      const profile = loadProfile(tmpDir);
      expect(profile.git_hooks.auto_install).toBe('skip');
    });

    it('preserves other config fields when git_hooks is added', () => {
      mkdirSync(join(tmpDir, '.ctxl'), { recursive: true });
      writeFileSync(
        join(tmpDir, '.ctxl', 'config.yaml'),
        'budget:\n  default_tokens: 8000\ngit_hooks:\n  auto_install: auto\n',
        'utf-8',
      );

      const profile = loadProfile(tmpDir);
      expect(profile.budget.default_tokens).toBe(8000);
      expect(profile.git_hooks.auto_install).toBe('auto');
    });
  });

  describe('Declined preference tracking', () => {
    it('declined marker file can be created and detected', () => {
      const declinedPath = join(tmpDir, '.ctxl', '.hooks-declined');
      mkdirSync(join(tmpDir, '.ctxl'), { recursive: true });
      writeFileSync(declinedPath, new Date().toISOString(), 'utf-8');

      expect(existsSync(declinedPath)).toBe(true);
    });
  });
});
