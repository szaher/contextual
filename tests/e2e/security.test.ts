import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { detectSecrets, containsSecrets, redactSecrets } from '@ctxl/core';
import { buildContextPack } from '@ctxl/core';
import { generateDiff } from '@ctxl/core';

describe('E2E: Security — Secret Detection', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxl-security-'));
    execSync('git init', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'ignore' });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should detect AWS access keys', () => {
    const text = 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE';
    expect(containsSecrets(text)).toBe(true);

    const secrets = detectSecrets(text);
    expect(secrets.length).toBeGreaterThan(0);
  });

  it('should detect API tokens and high-entropy strings', () => {
    const texts = [
      'api_key = sk-1234567890abcdef1234567890abcdef',
      'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
    ];

    for (const text of texts) {
      expect(containsSecrets(text)).toBe(true);
    }
  });

  it('should detect PEM private keys', () => {
    const pemKey = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF068jlJGiTGf
-----END RSA PRIVATE KEY-----`;

    expect(containsSecrets(pemKey)).toBe(true);

    const redacted = redactSecrets(pemKey);
    expect(redacted).toContain('[REDACTED:private_key]');
    expect(redacted).not.toContain('-----BEGIN RSA PRIVATE KEY-----');
  });

  it('should detect connection strings', () => {
    const connStrings = [
      'postgresql://user:password@localhost:5432/mydb',
      'mongodb://admin:secret@mongo.example.com:27017',
      'mysql://root:password123@db.server.com/app',
    ];

    for (const cs of connStrings) {
      expect(containsSecrets(cs)).toBe(true);
    }
  });

  it('should redact secrets from diff output', () => {
    const oldContent = `version: 1
summary: "Old project"
key_files:
  - path: config.ts
    why: "Configuration"
`;
    const newContent = `version: 1
summary: "Updated project with secrets"
key_files:
  - path: config.ts
    why: "Contains API_KEY=sk-1234567890abcdef1234567890abcdef"
`;

    const diff = generateDiff(oldContent, newContent, 'test/.ctx');
    // Diff should have secrets redacted
    expect(diff.diff).not.toContain('sk-1234567890abcdef1234567890abcdef');
  });

  it('should not include secrets in context pack items', () => {
    // Create a .ctx that references a file, but the .ctx content itself
    // should be clean (no secrets in .ctx entries)
    writeFileSync(join(tmpDir, '.ctx'), `version: 1
summary: "Security test project"
key_files:
  - path: main.ts
    why: "Entry point"
decisions:
  - id: d1
    title: "Use environment variables for secrets"
    rationale: "Never hardcode credentials"
    date: "2025-01-01"
tags: ["security"]
`);
    writeFileSync(join(tmpDir, 'main.ts'), 'export {};\n');
    execSync('git add -A && git commit -m "init"', { cwd: tmpDir, stdio: 'ignore' });

    const result = buildContextPack({
      workingDir: tmpDir,
      repoRoot: tmpDir,
      requestText: 'explain security practices',
      budgetTokens: 4000,
    });

    // Verify no secrets in pack content
    for (const item of result.pack.items) {
      expect(containsSecrets(item.content)).toBe(false);
    }
  });

  it('should not flag normal code as containing secrets', () => {
    const normalTexts = [
      'const x = 42;',
      'function handleRequest() {}',
      'export interface Config { port: number; }',
      'tags: ["api", "security", "auth"]',
      'The API endpoint returns JSON',
    ];

    for (const text of normalTexts) {
      expect(containsSecrets(text)).toBe(false);
    }
  });
});
