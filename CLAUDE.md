# ctxl Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-03-01

## Active Technologies

- TypeScript 5.x / Node.js 20+
- Hono (HTTP framework), better-sqlite3 (SQLite storage)
- `@modelcontextprotocol/sdk` ^1.27 (MCP server)
- `zod` ^3.25 (schema validation)
- `commander` ^13 (CLI)
- React 19, Vite 6 (dashboard UI)

## Project Structure

```text
packages/
  core/             @ctxl/core -- context engine (parse, score, pack, diff, redact)
  daemon/           @ctxl/daemon -- HTTP API + SQLite storage
  cli/              @ctxl/cli -- ctxkit CLI tool
  mcp/              @ctxl/mcp -- MCP server (10 tools over stdio)
  claude-plugin/    @ctxl/claude-plugin -- Claude Code plugin (8 hooks + /ctxkit skill)
  ui/               @ctxl/ui -- React inspection dashboard
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

- **@ctxl/mcp**: stdio-based MCP server (`ctxkit-mcp`). 10 tools: context_pack, log_event, propose_update, apply_proposal, reject_proposal, sessions.list, sessions.show, policy.get, policy.validate, memory.search
- **@ctxl/claude-plugin**: 8 hooks (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, TaskCompleted, PreCompact, SessionEnd). Interactive `/ctxkit` skill.
- **@ctxl/cli**: Commands include `inject`, `propose`, `apply`, `sessions`, `drift`, `daemon`, `dashboard`, `run`, `codex sync-agents`. All output commands support `--json`.

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
