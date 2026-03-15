# Example 27: Git Hooks

Demonstrates installing the `prepare-commit-msg` hook that injects `Ctxkit-*`
trailers into commit messages, permanently capturing context in git history.

## Setup

```bash
# In a git repository with ctxkit installed
ctxkit hooks init
```

## What Happens

After installing the hook, every commit automatically gets context trailers
appended to the message:

```
fix: update auth flow

Ctxkit-Session: sess_7d2f4a1b
Ctxkit-Files: src/auth/.ctx, src/api/.ctx
Ctxkit-Entries: 3
Ctxkit-Timestamp: 2026-03-15T14:30:00Z
```

The hook is a no-op when there is no active session and no `.ctx` files staged.

## Trailer Keys

| Key | When Present | Format |
|-----|-------------|--------|
| `Ctxkit-Session` | Active daemon session exists | `sess_[a-f0-9]{8}` |
| `Ctxkit-Files` | `.ctx` files are staged | Comma-separated paths |
| `Ctxkit-Entries` | Entry count > 0 | Integer |
| `Ctxkit-Timestamp` | Always (when trailers injected) | ISO 8601 |

## Hook Chaining

If a `prepare-commit-msg` hook already exists (e.g., from commitizen or husky),
ctxkit chains with it. The original runs first, then ctxkit appends trailers:

```bash
# Before: .git/hooks/prepare-commit-msg (your existing hook)
# After:
#   .git/hooks/prepare-commit-msg           <- ctxkit wrapper (calls original first)
#   .git/hooks/prepare-commit-msg.ctxkit-original  <- your original hook
```

## Querying Trailers

```bash
# Find commits with ctxkit session data
git log --format='%h %s %(trailers:key=Ctxkit-Session,valueonly)' | grep sess_

# Find commits from a specific session
git log --grep='Ctxkit-Session: sess_7d2f4a1b'
```

## Checking Status

```bash
ctxkit hooks status
# Hook                   Status
# ---------------------------------------
# prepare-commit-msg     installed
# pre-commit             not_installed
# post-commit            not_installed

ctxkit hooks status --json
```

## Removing Hooks

```bash
# Remove only the trailer hook
ctxkit hooks remove --context-trailers

# Remove all ctxkit hooks
ctxkit hooks remove --all
```

If hooks were chained, the original hook is restored.

## Auto-Install via Claude Code Plugin

The Claude Code plugin can auto-install hooks at session start:

```yaml
# .ctxl/config.yaml
git_hooks:
  auto_install: auto    # auto | prompt | skip
```

## Dashboard

View commit history with parsed trailers in the dashboard:

```bash
ctxkit dashboard
# Navigate to /commits
```

## Performance

- Hook completes within 500ms
- Daemon communication has a 200ms timeout (falls back to local-only data)
- All trailer values pass through secret redaction before writing

## Related

- [Guide: Git Hooks](/guide/git-hooks)
- [CLI Reference: ctxkit hooks](/api/cli-reference#ctxkit-hooks)
- [HTTP API: Commit Context](/api/http-api#commit-context)
