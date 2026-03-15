# ctxl Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-03-01

## Active Technologies
- TypeScript 5.x / Node.js 20+ + Hono 4.7, better-sqlite3 11.8, commander 13, zod 3.25, @modelcontextprotocol/sdk 1.27 (003-gap-remediation)
- SQLite via better-sqlite3 (WAL mode, single file at `~/.ctxl/data/ctxl.db`) (003-gap-remediation)
- TypeScript 5.7 / Node.js 20+ (004-ctxl-v2)
- SQLite via better-sqlite3 (WAL mode, `~/.ctxl/data/ctxl.db`) + filesystem (.ctx YAML, .ctxl YAML, .ctxl.lock YAML, .ctxl.history/ YAML) (004-ctxl-v2)

- TypeScript 5.x / Node.js 20+
- Hono (HTTP framework), better-sqlite3 (SQLite storage)
- `@modelcontextprotocol/sdk` ^1.27 (MCP server)
- `zod` ^3.25 (schema validation)
- `commander` ^13 (CLI)
- React 19, Vite 6 (dashboard UI)

## Project Structure

```text
packages/
  core/             @ctxkit/core -- context engine (parse, score, pack, diff, redact)
  daemon/           @ctxkit/daemon -- HTTP API + SQLite storage
  cli/              @ctxkit/cli -- ctxkit CLI tool
  mcp/              @ctxkit/mcp -- MCP server (10 tools over stdio)
  claude-plugin/    @ctxkit/claude-plugin -- Claude Code plugin (8 hooks + /ctxkit skill)
  ui/               @ctxkit/ui -- React inspection dashboard
tests/
  integration/      147 integration tests (10 files)
  e2e/              79 E2E tests (12 files)
  fixtures/         Test data (golden files, sample repos)
examples/           18 self-contained examples
docs/               Documentation site
```

## Commands

```bash
pnpm build          # Build all 6 packages
pnpm test           # Run integration tests
pnpm test:e2e       # Run E2E tests
pnpm lint           # Lint all packages
```

## Code Style

- TypeScript strict mode, ESLint + Prettier
- `import type` for type-only imports (`@typescript-eslint/consistent-type-imports`)
- Hook handlers: use `console.error()` for logging (never `console.log()` in stdio processes)
- ESLint flat config: use `/* global */` not `/* eslint-env */`

## Key Packages

- **@ctxkit/mcp**: stdio-based MCP server (`ctxkit-mcp`). 10 tools: context_pack, log_event, propose_update, apply_proposal, reject_proposal, sessions.list, sessions.show, policy.get, policy.validate, memory.search
- **@ctxkit/claude-plugin**: 8 hooks (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, TaskCompleted, PreCompact, SessionEnd). Interactive `/ctxkit` skill.
- **@ctxkit/cli**: Commands include `inject`, `propose`, `apply`, `sessions`, `drift`, `daemon`, `dashboard`, `run`, `codex sync-agents`. All output commands support `--json`.

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->

## Recent Changes
- 004-ctxl-v2: Added TypeScript 5.7 / Node.js 20+
- 003-gap-remediation: Added TypeScript 5.x / Node.js 20+ + Hono 4.7, better-sqlite3 11.8, commander 13, zod 3.25, @modelcontextprotocol/sdk 1.27
