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
      link: https://github.com/szaher/ctxl

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
  - title: Dashboard
    details: A local React-based inspection dashboard lets you browse sessions, inspect injected context per request, review proposals with diff preview, and audit every memory change with full attribution.
  - title: MCP Server
    details: 10 structured JSON-RPC tools exposed over stdio for any MCP-compatible agent. Tools cover context packing, event logging, proposal lifecycle, session inspection, policy validation, and memory search -- all discoverable via the standard MCP handshake.
  - title: Claude Code Plugin
    details: Automatic context injection via 8 lifecycle hooks with zero developer action required. The plugin injects context at session start, logs tool usage, validates proposals before file writes, and compacts memory at the end of each session.
---

## Why ctxl?

AI coding agents work best when they have the right context. But "right context" changes with every request -- the auth module needs different knowledge than the database layer. Reading every file is slow and expensive. Static prompts go stale.

ctxl solves this with `.ctx` files: human-readable, git-tracked memory documents that live alongside your code. Each directory can have one, and ctxl merges them hierarchically, scores entries for relevance, and assembles a token-budgeted Context Pack for each agent request.

The result: deterministic, inspectable context injection. Same input, same output, every time.

## Architecture

ctxl is a TypeScript monorepo with six packages:

| Package | Description |
|---------|-------------|
| `@ctxl/core` | Parser, scorer, packer, differ, drift detector, config loader, secret redaction |
| `@ctxl/daemon` | Hono HTTP server with SQLite storage for sessions, events, proposals, and audit |
| `@ctxl/cli` | The `ctxkit` command-line tool for all operations |
| `@ctxl/ui` | React-based local inspection dashboard |
| `@ctxl/mcp` | MCP server exposing 10 JSON-RPC tools over stdio (`ctxkit-mcp` command) |
| `@ctxl/claude-plugin` | Claude Code plugin with 8 lifecycle hooks and `/ctxkit` skill |

## Quick Example

```bash
# Initialize context in your project
ctxkit init

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
```
