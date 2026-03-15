# Research: Git Hooks PR Context & Embedded UI

**Feature**: 005-git-hooks-pr-context
**Date**: 2026-03-15

## R1: Git Hook Type Selection

**Decision**: Use `prepare-commit-msg` hook for context trailer injection.

**Rationale**: This hook runs after the default message is created but before the editor opens, allowing the developer to review and edit injected trailers. Unlike `commit-msg` (which runs after the editor closes), `prepare-commit-msg` gives users visibility and control. Unlike `post-commit` (which can't modify the message), it allows message modification.

**Alternatives considered**:
- `commit-msg`: Runs after editor closes — user can't review injected content before committing. Rejected for transparency principle.
- `post-commit`: Cannot modify the commit message. Would require amending, which is destructive. Rejected.
- `pre-commit`: Runs before the message is even created. Wrong lifecycle point. Rejected.

## R2: Existing Hook Infrastructure

**Decision**: Extend the existing `hooks-cmd.ts` rather than creating a new command.

**Rationale**: The CLI already has `ctxkit hooks init` which installs `pre-commit` and `post-commit` hooks. Adding `prepare-commit-msg` to this existing command follows the established pattern. The existing code handles hook file creation, permission setting (755), and graceful degradation. Reusing this avoids duplication (Constitution Principle II).

**Existing code location**: `packages/cli/src/commands/hooks-cmd.ts`
**Existing pattern**: Shell script hooks that call `ctxkit` subcommands, with `#!/bin/sh` shebang and ctxkit availability check.

## R3: Trailer Format Specification

**Decision**: Standard git trailers with `Ctxkit-` prefix.

**Rationale**: Git trailers are a well-established convention (`git interpret-trailers`, `git log --format=%(trailers)`). They are rendered by GitHub, GitLab, and parsed by CI/CD tools natively. The `Ctxkit-` prefix avoids conflicts with `Signed-off-by`, `Co-authored-by`, and other standard trailers.

**Trailer keys**:
- `Ctxkit-Session`: Active session ID (e.g., `sess_abc123`)
- `Ctxkit-Files`: Comma-separated list of changed .ctx file paths
- `Ctxkit-Entries`: Count of context entries relevant to the commit
- `Ctxkit-Timestamp`: ISO 8601 timestamp of trailer injection

**Example output**:
```
fix: update authentication flow

Ctxkit-Session: sess_7d2f4a1b
Ctxkit-Files: src/auth/.ctx, src/auth/oauth/.ctx
Ctxkit-Entries: 3
Ctxkit-Timestamp: 2026-03-15T14:30:00Z
```

## R4: Hook-to-Daemon Communication

**Decision**: HTTP request to local daemon with 200ms timeout, fallback to local-only data.

**Rationale**: The daemon already runs on `localhost:4117` (default port) and provides session data via REST API. A single GET request to `/api/v1/sessions?status=active` retrieves the current session. The 200ms timeout ensures the hook doesn't block commits when the daemon is down. Fallback reads staged .ctx files directly from git index.

**Alternatives considered**:
- Environment variable (session ID in `CTXKIT_SESSION`): Simpler but requires the plugin/daemon to set it. Can be used as supplementary source.
- File-based (PID file with session data): Adds filesystem complexity. Rejected.
- Unix socket: More efficient but adds platform complexity. Rejected for boring-tech preference.

## R5: Dashboard Commit History Implementation

**Decision**: New `CommitHistoryPage.tsx` in UI, new daemon API endpoint, with CLI-only fallback via git log parsing.

**Rationale**: The UI already has 9 pages with React Router routing. Adding a 10th page at `/commits` follows the established pattern. The daemon API endpoint parses trailers from `git log` and caches results in SQLite. For CLI-only mode (no daemon), the dashboard reads directly from `git log --format`.

**Existing patterns to follow**:
- Page component: Same structure as `SessionDetail.tsx` (fetch data, render table/timeline)
- API route: Same structure as `pr-context-routes.ts` (Hono handler, git exec, JSON response)
- API client: Same structure as `api.ts` (fetch wrapper function)

## R6: CLI Dashboard Serving

**Decision**: Enhance the existing `ctxkit dashboard` command to serve the built UI as a static site via the daemon's HTTP server.

**Rationale**: The `packages/cli/src/commands/daemon.ts` already starts a Hono server. The `packages/ui/` builds to `dist/` via Vite. Serving `ui/dist/` as static files from the daemon's Hono server is trivial (Hono has `serveStatic` middleware). The CLI command starts the daemon if not running, serves the UI, and opens the browser.

**Existing code**: `daemon.ts` CLI command starts/stops the daemon. The UI is already built as a standalone SPA.

## R7: Secret Redaction in Trailers

**Decision**: Apply `redactSecrets()` from `@ctxkit/core` to all trailer values before writing.

**Rationale**: The redaction engine already detects 8 secret patterns (AWS keys, API tokens, PEM keys, connection strings, GitHub tokens, bearer tokens, base64 secrets). Applying it to trailer values is a single function call. Since commit messages are permanently stored in git history and often pushed to shared repos, redaction is essential.

**Existing code**: `packages/core/src/redact/secrets.ts` — `redactSecrets(text): string`

## R8: Hook Chaining Strategy

**Decision**: Detect existing `prepare-commit-msg` hooks and wrap them — run existing hook first, then append ctxkit trailers.

**Rationale**: The existing `hooks-cmd.ts` creates standalone hook scripts. For `prepare-commit-msg`, we need to handle the case where another tool (e.g., commitizen, husky) already has a hook installed. The strategy is:
1. If no existing hook: create the ctxkit hook script directly.
2. If existing hook: rename it to `prepare-commit-msg.ctxkit-original`, create a new hook that calls the original first, then appends trailers.
3. On uninstall: restore the original hook if it exists.

This is the same pattern used by tools like `husky` and `lefthook`.
