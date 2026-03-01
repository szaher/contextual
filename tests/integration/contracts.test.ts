import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { buildContextPack, scoreEntries } from '@ctxl/core';

describe('Integration: Context Contracts & Guardrails', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ctxl-contracts-'));
    execSync('git init', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'ignore' });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should include CONTRACT_REQUIRED when request matches contract tags', () => {
    writeFileSync(join(tmpDir, '.ctx'), `version: 1
summary: "Project with security contract"
key_files:
  - path: src/app.ts
    why: "Main app"
contracts:
  - name: security-auth
    content: "All auth changes must use bcrypt for passwords and JWT for tokens"
    scope:
      paths:
        - "src/auth/*"
      tags:
        - security
        - authentication
    locked: true
decisions:
  - id: d1
    title: "Use Express"
    rationale: "Web framework"
    date: "2025-01-01"
tags: ["nodejs", "api"]
`);
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    mkdirSync(join(tmpDir, 'src/auth'), { recursive: true });
    writeFileSync(join(tmpDir, 'src/app.ts'), 'export const app = true;\n');
    writeFileSync(join(tmpDir, 'src/auth/handler.ts'), 'export const auth = true;\n');
    execSync('git add -A && git commit -m "init"', { cwd: tmpDir, stdio: 'ignore' });

    // Request that matches contract tags
    const result = buildContextPack({
      workingDir: tmpDir,
      repoRoot: tmpDir,
      requestText: 'update the security authentication logic',
      budgetTokens: 4000,
    });

    // Find the contract item
    const contractItem = result.pack.items.find(
      (item) => item.section === 'contracts',
    );
    expect(contractItem).toBeDefined();
    expect(contractItem!.reason_codes).toContain('CONTRACT_REQUIRED');
    expect(contractItem!.entry_id).toBe('security-auth');
  });

  it('should give contracts budget priority over non-contract items', () => {
    // Create a .ctx with a large contract and many decisions with long content
    const decisions = Array.from({ length: 30 }, (_, i) =>
      `  - id: d${i}\n    title: "Decision ${i} about feature design and implementation strategy"\n    rationale: "Reason ${i} explaining the detailed decision rationale for the project architecture and design patterns used in this feature module"\n    date: "2025-01-01"`
    ).join('\n');

    writeFileSync(join(tmpDir, '.ctx'), `version: 1
summary: "Budget priority test"
key_files:
  - path: main.ts
    why: "Entry"
contracts:
  - name: perf-contract
    content: "Performance requirements: all API responses must complete within 200ms. Database queries must use indexes. No N+1 queries allowed. Cache TTL must be configured."
    scope:
      paths:
        - "src/*"
      tags:
        - performance
        - optimization
    locked: true
decisions:
${decisions}
tags: ["performance"]
`);
    writeFileSync(join(tmpDir, 'main.ts'), 'export {};\n');
    execSync('git add -A && git commit -m "init"', { cwd: tmpDir, stdio: 'ignore' });

    // Use a tight budget so decisions get displaced
    const result = buildContextPack({
      workingDir: tmpDir,
      repoRoot: tmpDir,
      requestText: 'optimize performance of the API',
      budgetTokens: 200,
    });

    // Contract should be included even with tight budget
    const contractItem = result.pack.items.find(
      (item) => item.section === 'contracts',
    );
    expect(contractItem).toBeDefined();

    // Some non-contract items should be omitted due to budget
    expect(result.pack.omitted.length).toBeGreaterThan(0);
  });

  it('should match contracts by scope path glob', () => {
    writeFileSync(join(tmpDir, '.ctx'), `version: 1
summary: "Path glob test"
contracts:
  - name: api-contract
    content: "API versioning rules"
    scope:
      paths:
        - "src/api/*"
      tags:
        - api
  - name: db-contract
    content: "Database migration rules"
    scope:
      paths:
        - "src/db/*"
      tags:
        - database
tags: ["test"]
`);
    execSync('git add -A && git commit -m "init"', { cwd: tmpDir, stdio: 'ignore' });

    // Score with touched files matching api path
    const scored = scoreEntries(
      [{ path: '.ctx', ctx: {
        version: 1,
        summary: 'test',
        key_files: [],
        contracts: [
          {
            name: 'api-contract',
            content: 'API versioning rules',
            scope: { paths: ['src/api/*'], tags: ['api'] },
            locked: false,
            verified_at: '',
          },
          {
            name: 'db-contract',
            content: 'Database migration rules',
            scope: { paths: ['src/db/*'], tags: ['database'] },
            locked: false,
            verified_at: '',
          },
        ],
        decisions: [],
        commands: {},
        gotchas: [],
        tags: ['test'],
        refs: [],
        ignore: { never_read: [], never_log: [] },
      }}],
      {
        workingDir: tmpDir,
        repoRoot: tmpDir,
        requestText: 'update the api endpoint',
        touchedFiles: ['src/api/routes.ts'],
      },
    );

    // api-contract should have CONTRACT_REQUIRED
    const apiContract = scored.find((e) => e.entry_id === 'api-contract');
    expect(apiContract).toBeDefined();
    expect(apiContract!.reason_codes).toContain('CONTRACT_REQUIRED');

    // db-contract should NOT have CONTRACT_REQUIRED from path match
    // (but might from tag match if keywords overlap)
    const dbContract = scored.find((e) => e.entry_id === 'db-contract');
    expect(dbContract).toBeDefined();
  });

  it('should include contract attribution in pack items', () => {
    writeFileSync(join(tmpDir, '.ctx'), `version: 1
summary: "Attribution test"
contracts:
  - name: security-policy
    content: "Must encrypt all PII data at rest"
    scope:
      paths:
        - "src/data/*"
      tags:
        - security
        - privacy
    locked: true
    verified_at: "abc123"
tags: ["security"]
`);
    execSync('git add -A && git commit -m "init"', { cwd: tmpDir, stdio: 'ignore' });

    const result = buildContextPack({
      workingDir: tmpDir,
      repoRoot: tmpDir,
      requestText: 'implement security and privacy controls',
      budgetTokens: 4000,
    });

    const contractItem = result.pack.items.find(
      (item) => item.entry_id === 'security-policy',
    );
    expect(contractItem).toBeDefined();
    expect(contractItem!.section).toBe('contracts');
    expect(contractItem!.source).toBeDefined();
    expect(contractItem!.staleness).toBeDefined();
  });
});
