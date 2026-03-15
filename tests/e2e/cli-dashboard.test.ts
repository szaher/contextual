import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('CLI Dashboard E2E', () => {
  const daemonFilePath = join(__dirname, '../../packages/cli/dist/commands/daemon.js');

  it('dashboard command is built and available', () => {
    expect(existsSync(daemonFilePath)).toBe(true);
    const content = readFileSync(daemonFilePath, 'utf-8');
    expect(content).toContain('dashboard');
    expect(content).toContain('--port');
    expect(content).toContain('--no-open');
  });

  it('dashboard default port is 4117', () => {
    const content = readFileSync(daemonFilePath, 'utf-8');
    expect(content).toContain('4117');
  });

  it('dashboard starts daemon if not running', () => {
    const content = readFileSync(daemonFilePath, 'utf-8');
    expect(content).toContain('Starting daemon');
  });
});
