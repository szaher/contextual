# Quick Start

This guide walks through the core ctxl workflow: initializing context, validating it, building a Context Pack, starting the daemon, and opening the dashboard.

## Step 1: Initialize a .ctx File

Navigate to your project root and generate a `.ctx` file:

```bash
cd /path/to/your/project
ctxkit init
```

The `init` command scans your directory for metadata sources:

- **package.json** -- extracts description, scripts (as commands), keywords (as tags), and detects tech stack from dependencies
- **tsconfig.json** -- adds as a key file and tags with `typescript`
- **README.md** -- extracts the first content line as the summary
- **Entry points** -- detects `src/index.ts`, `src/main.ts`, and similar files

Example output:

```
Created .ctx at /path/to/your/project/.ctx
  Summary: Context & Memory Manager for coding agents
  Key files: 3
  Commands: 8
  Tags: typescript, testing
```

The generated `.ctx` file is a YAML document you can edit by hand. See the [.ctx File Format](/guide/ctx-format) reference for all available fields.

## Step 2: Validate the .ctx File

Check that your `.ctx` file is structurally correct:

```bash
ctxkit validate
```

To also verify that referenced files exist on disk:

```bash
ctxkit validate --check-files
```

The validator checks for:

- Required fields (version, summary)
- Unique identifiers (key file paths, contract names, decision IDs)
- Proper types and structures
- Missing purposes or empty content (as warnings)

## Step 3: Build a Context Pack

See what context would be injected for a hypothetical request:

```bash
ctxkit inject --request "fix the auth bug in the login handler"
```

Output shows included items with reason codes and token accounting:

```
Context Pack (1842 / 4000 tokens)
----------------------------------------

Included (5 items):
  1. [LOCALITY_HIGH, TAG_MATCH]  src/auth/.ctx -> contracts/auth-api (320 tok)
  2. [CONTRACT_REQUIRED]         .ctx -> contracts/security-policy (280 tok)
  3. [LOCALITY_HIGH]             src/auth/.ctx -> key_files/login.ts (150 tok)
  4. [TAG_MATCH]                 .ctx -> decisions/ADR-003 (210 tok)
  5. [LOCALITY_HIGH]             src/auth/.ctx -> summary (180 tok)

Omitted (2 items):
  - .ctx -> gotchas (score: 0.22, reason: BUDGET_EXCEEDED)
  - .ctx -> key_files/db.ts (score: 0.18, reason: LOW_SCORE)
```

You can adjust the budget with `--budget`:

```bash
ctxkit inject --request "fix the auth bug" --budget 8000
```

## Step 4: Start the Daemon

The daemon provides persistent session tracking, proposal management, and audit logging:

```bash
ctxkit daemon start
```

```
Daemon started (PID 12345) on port 3742
Logs: ~/.ctxl/daemon.log
Dashboard: http://localhost:3742
```

Check the daemon status:

```bash
ctxkit daemon status
```

```
Status: ok
Version: 0.1.0
Uptime: 5 minutes
```

## Step 5: Open the Dashboard

Launch the inspection dashboard in your browser:

```bash
ctxkit dashboard
```

This opens `http://localhost:3742` where you can:

- Browse active and recent agent sessions
- Inspect injected context per request with reason codes and token estimates
- Review and approve `.ctx` update proposals
- View the audit log of all memory changes

## Step 6: Wrap an Agent

Use `ctxkit run` to wrap any agent command with automatic context injection:

```bash
ctxkit run --request "refactor the database layer" -- your-agent-command
```

This:

1. Creates a session on the daemon
2. Builds a Context Pack from `.ctx` files in the hierarchy
3. Injects the pack via environment variables (`CTXL_CONTEXT_PACK`, `CTXL_SESSION_ID`, etc.)
4. Spawns the agent command
5. Ends the session when the agent exits

## Step 7: Check for Drift

After code changes, check if `.ctx` entries have gone stale:

```bash
ctxkit drift
```

This scans all `.ctx` files in the repository and reports entries that reference:

- Deleted files
- Renamed files
- Files modified since their last verification
- Commits that no longer exist

## Next Steps

- Read about [Core Concepts](/getting-started/concepts) to understand the mental model
- Learn the full [.ctx File Format](/guide/ctx-format) for writing effective context
- Understand the [Scoring Algorithm](/guide/scoring-algorithm) that drives relevance ranking
- Set up [Profiles](/guide/profiles) for per-repo and per-agent configuration
