---
layout: home

hero:
  name: ctxl
  text: Context Memory for AI Coding Agents
  tagline: Local-first, deterministic context injection that makes your AI agents smarter without reading every file.
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started/installation
    - theme: alt
      text: View on GitHub
      link: https://github.com/szaher/contextual

features:
  - title: Hierarchical Memory
    details: Place .ctx files at any directory level. ctxl loads them from the working directory up to the repo root, merging entries with clear precedence rules. Subdirectory knowledge overrides root-level defaults.
  - title: Smart Scoring
    details: Every memory entry is scored by locality (directory distance), tag matching, recency (verification status), and explicit pins. The highest-relevance items are injected first, with full reason codes for transparency.
  - title: Budget Control
    details: Declare a token budget and ctxl enforces it strictly. Contracts get priority, then entries are packed by score. Omitted items are listed with their scores and exclusion reasons so you always know what was left out.
  - title: Drift Detection
    details: ctxl watches for stale .ctx entries by checking referenced files against git history. Deleted files, renames, and modifications since the last verification are surfaced as actionable warnings with proposed fixes.
  - title: Secret Redaction
    details: Eight built-in patterns detect AWS keys, API tokens, PEM keys, connection strings, GitHub tokens, bearer tokens, and more. Secrets are automatically redacted from diffs and proposals before they reach disk.
  - title: Index System
    details: A YAML index file at the repo root catalogs every .ctx file with summaries, tags, checksums, dependency edges, and token estimates. The index powers fast selection, dependency graphing, and category-budgeted packing.
  - title: Version Tracking
    details: Every .ctx modification is automatically versioned with inline history entries recording timestamp, author, session, reason, and diff summary. Overflow entries archive to .ctxl.history/ for full auditability.
  - title: Conflict Resolution
    details: When multiple agents edit the same .ctx file concurrently, a three-way merge algorithm resolves changes at the section level. A lock manager with 5-minute TTL prevents write races, and unresolvable conflicts are surfaced for manual resolution.
  - title: Auto-Update
    details: A staleness tracker watches file edits during sessions and automatically generates .ctx update proposals when tasks complete. Proposals can be auto-applied or queued for human review based on policy.
  - title: Bootstrap
    details: Analyze any directory to generate .ctx files from package.json, tsconfig, and source files. Bootstrap creates summaries, key_files, tags, and commands in a single pass, with dry-run support and skip-existing safety.
  - title: Spec-Kit Bridge
    details: Import constitution MUST/SHALL clauses as locked decisions and contracts, import component specs as contracts and gotchas, export .ctx to markdown or YAML spec format, and keep both sides in sync with bidirectional validation.
  - title: PR Context
    details: Generate rich pull request descriptions from session data including prompt chains, agent decisions, file changes, and context usage statistics. Output as markdown, JSON, or directly as a GitHub PR body.
  - title: Dashboard
    details: A local React-based inspection dashboard lets you browse sessions, inspect injected context per request, review proposals with diff preview, view dependency graphs, monitor real-time activity, and audit every memory change with full attribution.
  - title: Git Hooks
    details: Install a prepare-commit-msg hook that automatically injects Ctxkit-* trailers into commit messages. Trailers capture session ID, staged .ctx files, entry count, and timestamp -- permanently linking context to git history. Supports hook chaining, auto-install via Claude Code plugin, and clean removal.
  - title: MCP Server
    details: 17 structured JSON-RPC tools exposed over stdio for any MCP-compatible agent. Tools cover context packing, event logging, proposal lifecycle, session inspection, policy validation, memory search, index operations, conflict resolution, version history, and commit context -- all discoverable via the standard MCP handshake.
  - title: Claude Code Plugin
    details: Automatic context injection via 8 lifecycle hooks with zero developer action required. The plugin injects context at session start, logs tool usage, validates proposals before file writes, tracks staleness for auto-update, and compacts memory at the end of each session.
---

## Why ctxl?

AI coding agents work best when they have the right context. But "right context" changes with every request -- the auth module needs different knowledge than the database layer. Reading every file is slow and expensive. Static prompts go stale.

ctxl solves this with `.ctx` files: human-readable, git-tracked memory documents that live alongside your code. Each directory can have one, and ctxl merges them hierarchically, scores entries for relevance, and assembles a token-budgeted Context Pack for each agent request.

The result: deterministic, inspectable context injection. Same input, same output, every time.

## Architecture

ctxl is a TypeScript monorepo with seven packages:

| Package | Description |
|---------|-------------|
| `@ctxkit/core` | Parser, scorer, packer, differ, drift detector, config loader, secret redaction, index engine, versioning, conflict resolution, bootstrap |
| `@ctxkit/daemon` | Hono HTTP server with SQLite storage for sessions, events, proposals, audit, index, conflicts, and activity |
| `@ctxkit/cli` | The `ctxkit` command-line tool for all operations |
| `@ctxkit/ui` | React-based local inspection dashboard |
| `@ctxkit/mcp` | MCP server exposing 16 JSON-RPC tools over stdio (`ctxkit-mcp` command) |
| `@ctxkit/claude-plugin` | Claude Code plugin with 8 lifecycle hooks and `/ctxkit` skill |
| `@ctxkit/speckit-bridge` | Bidirectional sync between .ctx files and Spec-Kit specifications |

## Quick Example

```bash
# Initialize context in your project
ctxkit init

# Bootstrap .ctx files for the entire repo
ctxkit bootstrap --mode full

# Generate the .ctxl index
ctxkit index generate

# See what context would be injected for a request
ctxkit inject --request "fix the auth bug in login handler"

# Start the daemon for session tracking
ctxkit daemon start

# Wrap an agent with context injection
ctxkit run -- your-agent-command

# Connect to Claude Code (installs the plugin)
ctxkit claude install

# Connect to Codex via MCP
codex mcp add ctxkit -- ctxkit-mcp

# Generate AGENTS.md for Codex from .ctx files
ctxkit codex sync-agents

# View version history for a .ctx file
ctxkit history src/auth/.ctx --diff 1..5

# Generate a PR description from session data
ctxkit pr --format md

# Install git hooks for context trailers in commits
ctxkit hooks init

# View commit history with trailers in the dashboard
ctxkit dashboard

# Migrate v1 .ctx files to v2
ctxkit migrate
```
