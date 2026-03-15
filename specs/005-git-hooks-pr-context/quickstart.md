# Quickstart: Git Hooks PR Context

## Install hooks in your repo

```bash
# Install all ctxkit git hooks (pre-commit, post-commit, prepare-commit-msg)
ctxkit hooks init

# Check installation status
ctxkit hooks status
```

## Make a commit with context trailers

```bash
# Start a session (optional — trailers also work without a session for .ctx changes)
ctxkit daemon start
ctxkit run -- your-agent-command

# Make changes including .ctx files, then commit normally
git add .
git commit -m "fix: update auth flow"

# The commit message now includes context trailers:
git log -1 --format='%B'
# fix: update auth flow
#
# Ctxkit-Session: sess_7d2f4a1b
# Ctxkit-Files: src/auth/.ctx
# Ctxkit-Entries: 2
# Ctxkit-Timestamp: 2026-03-15T14:30:00Z
```

## View context history in the dashboard

```bash
# Open the dashboard (starts daemon if needed)
ctxkit dashboard

# Browse to the Commits page to see all context-enriched commits
```

## Query trailers with git

```bash
# Find all commits with ctxkit session data
git log --format='%h %s %(trailers:key=Ctxkit-Session,valueonly)' | grep sess_

# Find commits from a specific session
git log --grep='Ctxkit-Session: sess_7d2f4a1b'
```

## Remove hooks

```bash
# Remove only the prepare-commit-msg hook
ctxkit hooks remove --context-trailers

# Remove all ctxkit hooks
ctxkit hooks remove --all
```

## Claude Code integration

The Claude Code plugin automatically installs the `prepare-commit-msg` hook at session start (configurable via `.ctxl` config). Every commit the agent makes includes context trailers describing the session and .ctx usage.

```yaml
# .ctxl config — hook policy
hooks:
  auto_install: true    # auto | prompt | skip
```
