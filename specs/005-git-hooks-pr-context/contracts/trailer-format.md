# Trailer Format Contract

## Git Trailer Specification

Context trailers use the standard git trailer format as defined by `git interpret-trailers`. All trailer keys use the `Ctxkit-` prefix to avoid conflicts with standard trailers (`Signed-off-by`, `Co-authored-by`, etc.).

## Trailer Keys

| Key | Required | Format | Example |
|-----|----------|--------|---------|
| `Ctxkit-Session` | No (only if session active) | `sess_[a-f0-9]{8}` | `Ctxkit-Session: sess_7d2f4a1b` |
| `Ctxkit-Files` | No (only if .ctx files staged) | Comma-separated relative paths | `Ctxkit-Files: src/auth/.ctx, lib/.ctx` |
| `Ctxkit-Entries` | No (only if entries > 0) | Non-negative integer | `Ctxkit-Entries: 3` |
| `Ctxkit-Timestamp` | Yes (always present) | ISO 8601 | `Ctxkit-Timestamp: 2026-03-15T14:30:00Z` |

At least one of `Ctxkit-Session` or `Ctxkit-Files` must be present for the trailer block to be written. If neither is present, the hook is a no-op.

## Complete Example

```
fix: update authentication flow to use OAuth2

Refactored the login handler to support OAuth2 providers.
Updated the session management to handle token refresh.

Ctxkit-Session: sess_7d2f4a1b
Ctxkit-Files: src/auth/.ctx, src/auth/oauth/.ctx
Ctxkit-Entries: 3
Ctxkit-Timestamp: 2026-03-15T14:30:00Z
```

## Parsing Rules

1. Trailers are located after the last blank line in the commit message
2. Only lines matching `Ctxkit-[A-Za-z]+: .+` are extracted
3. Other trailers (e.g., `Signed-off-by`) are ignored by the parser
4. Values are trimmed of leading/trailing whitespace
5. `Ctxkit-Files` values are split on `, ` (comma-space) to produce the file list
6. Missing keys are treated as null/absent (not empty string)

## Querying with Git

```bash
# All ctxkit trailers from recent commits
git log --format='%H %s%n%(trailers:key=Ctxkit-Session,key=Ctxkit-Files,key=Ctxkit-Entries,key=Ctxkit-Timestamp)' --since='1 week ago'

# Commits with any ctxkit trailer
git log --format='%H %s' --grep='Ctxkit-Session:' --grep='Ctxkit-Files:' --all-match

# Just session IDs
git log --format='%(trailers:key=Ctxkit-Session,valueonly)'
```

## Redaction

All trailer values pass through `redactSecrets()` from `@ctxkit/core` before being written. If a .ctx file path or session data contains a detected secret pattern, it is replaced with `[REDACTED:<type>]`.
