# Git Hooks

ctxkit can install git hooks that automatically inject context trailers into commit messages. This permanently captures session context in git history without dedicated files.

## Installation

```bash
ctxkit hooks init
```

This installs three hooks:
- **pre-commit**: Validates staged `.ctx` files
- **post-commit**: Updates `.ctxl` index after commit
- **prepare-commit-msg**: Injects `Ctxkit-*` trailers into commit messages

## Trailer Format

Trailers use the standard git trailer format with the `Ctxkit-` prefix:

```
fix: update auth flow

Ctxkit-Session: sess_7d2f4a1b
Ctxkit-Files: src/auth/.ctx, src/api/.ctx
Ctxkit-Entries: 3
Ctxkit-Timestamp: 2026-03-15T14:30:00Z
```

| Key | When Present | Format |
|-----|-------------|--------|
| `Ctxkit-Session` | Active session exists | `sess_[a-f0-9]{8}` |
| `Ctxkit-Files` | `.ctx` files are staged | Comma-separated paths |
| `Ctxkit-Entries` | Entry count > 0 | Integer |
| `Ctxkit-Timestamp` | Always (when trailers injected) | ISO 8601 |

## Hook Chaining

If a `prepare-commit-msg` hook already exists (from another tool like commitizen or husky), ctxkit chains with it: the original hook runs first, then ctxkit appends trailers. The original is preserved as `prepare-commit-msg.ctxkit-original`.

## Querying Trailers

```bash
# Find all commits with ctxkit session data
git log --format='%h %s %(trailers:key=Ctxkit-Session,valueonly)' | grep sess_

# Find commits from a specific session
git log --grep='Ctxkit-Session: sess_7d2f4a1b'
```

## Dashboard

The commit history is viewable in the dashboard UI at the `/commits` page:

```bash
ctxkit dashboard
```

## Checking Status

```bash
ctxkit hooks status
ctxkit hooks status --json
```

## Removing Hooks

```bash
# Remove only the prepare-commit-msg hook
ctxkit hooks remove --context-trailers

# Remove all ctxkit hooks
ctxkit hooks remove --all
```

If hooks were chained, the original hook is restored.

## Claude Code Integration

The Claude Code plugin can auto-install hooks at session start based on policy:

```yaml
# .ctxl/config.yaml
git_hooks:
  auto_install: auto    # auto | prompt | skip
```

- **auto**: Silently install hooks at session start
- **prompt**: Suggest installation (default)
- **skip**: Never install automatically

## Security

All trailer values pass through the secret redaction engine before writing. Any detected secrets (API keys, tokens, connection strings) are replaced with `[REDACTED:<type>]`.

## Performance

- Hook execution completes within 500ms
- Daemon communication has a 200ms timeout (falls back to local-only data)
- Hook is a no-op when there is no active session and no `.ctx` files staged
