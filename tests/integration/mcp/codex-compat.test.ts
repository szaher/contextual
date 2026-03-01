import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';

/**
 * T042 — Integration test for Codex MCP registration compatibility.
 *
 * Verifies that the MCP server stdio interface is compatible with
 * the Codex MCP registration format (command + args in config.toml style).
 */

const MCP_PACKAGE_DIR = resolve(
  import.meta.dirname,
  '../../../packages/mcp',
);

describe('Integration: Codex MCP Compatibility', () => {
  it('should have a bin entry for ctxkit-mcp command', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(MCP_PACKAGE_DIR, 'package.json'), 'utf-8'),
    );
    expect(pkg.bin).toBeDefined();
    expect(pkg.bin['ctxkit-mcp']).toBeDefined();
    expect(pkg.bin['ctxkit-mcp']).toBe('dist/index.js');
  });

  it('should have entry point file', () => {
    const entryPoint = resolve(MCP_PACKAGE_DIR, 'dist/index.js');
    expect(existsSync(entryPoint)).toBe(true);
  });

  it('should have stdio transport (not HTTP)', () => {
    const indexSrc = readFileSync(
      resolve(MCP_PACKAGE_DIR, 'src/index.ts'),
      'utf-8',
    );
    expect(indexSrc).toContain('StdioServerTransport');
    expect(indexSrc).not.toContain('StreamableHTTPServerTransport');
  });

  it('should be registerable with codex mcp add format', () => {
    // Codex expects: codex mcp add <name> -- <command> [args...]
    // Our command: ctxkit-mcp (no args needed)
    const pkg = JSON.parse(
      readFileSync(resolve(MCP_PACKAGE_DIR, 'package.json'), 'utf-8'),
    );

    // The command name should be a simple string, no flags required
    const binName = Object.keys(pkg.bin)[0];
    expect(binName).toBe('ctxkit-mcp');
    // Must be a single command word (no spaces)
    expect(binName.split(' ')).toHaveLength(1);
  });

  it('should have .mcp.json compatible with Codex registration', () => {
    const mcpJsonPath = resolve(
      import.meta.dirname,
      '../../../packages/claude-plugin/.mcp.json',
    );
    expect(existsSync(mcpJsonPath)).toBe(true);

    const mcpConfig = JSON.parse(readFileSync(mcpJsonPath, 'utf-8'));
    expect(mcpConfig.mcpServers).toBeDefined();
    expect(mcpConfig.mcpServers.ctxkit).toBeDefined();
    expect(mcpConfig.mcpServers.ctxkit.command).toBe('ctxkit-mcp');
    expect(mcpConfig.mcpServers.ctxkit.args).toEqual([]);
  });

  it('should have codex instruction template', () => {
    const instructionsPath = resolve(
      MCP_PACKAGE_DIR,
      'templates/codex-instructions.md',
    );
    expect(existsSync(instructionsPath)).toBe(true);

    const content = readFileSync(instructionsPath, 'utf-8');
    // Should mention all 10 tools
    expect(content).toContain('ctxkit.context_pack');
    expect(content).toContain('ctxkit.log_event');
    expect(content).toContain('ctxkit.propose_update');
    expect(content).toContain('ctxkit.apply_proposal');
    expect(content).toContain('ctxkit.reject_proposal');
    expect(content).toContain('ctxkit.sessions.list');
    expect(content).toContain('ctxkit.sessions.show');
    expect(content).toContain('ctxkit.policy.get');
    expect(content).toContain('ctxkit.policy.validate');
    expect(content).toContain('ctxkit.memory.search');

    // Should mention codex registration command
    expect(content).toContain('codex mcp add');
  });
});
