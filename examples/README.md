# ctxl Examples

A comprehensive set of examples demonstrating every major feature of ctxl,
the Context and Memory Manager for AI coding agents.

## Prerequisites

- Node.js 20+
- pnpm 9+
- ctxl installed and built (`pnpm install && pnpm build`)
- A git repository to experiment in

## How to Use These Examples

Each example directory is self-contained. You can copy any example into
a git repository to try it out, or browse the files to understand the
`.ctx` format and `ctxkit` commands.

```bash
# Copy an example into a test repo
cp -r examples/01-basic-ctx /path/to/your/repo/

# Or initialize a fresh repo to experiment
mkdir /tmp/ctxl-playground && cd /tmp/ctxl-playground && git init
cp -r examples/01-basic-ctx/* .
```

## Example Index

| #  | Directory                   | Topic                          | Description                                                        |
|----|-----------------------------|--------------------------------|--------------------------------------------------------------------|
| 01 | [01-basic-ctx](01-basic-ctx)               | Basic .ctx file                | The simplest possible .ctx file with a summary, tags, and commands. |
| 02 | [02-key-files](02-key-files)               | Key files                      | Mapping important files with tags, locks, and verification.        |
| 03 | [03-decisions](03-decisions)               | Architectural decisions        | Recording ADR-style decisions with rationale and alternatives.     |
| 04 | [04-contracts](04-contracts)               | Contracts and guardrails       | Defining must-include invariants with scope matching.              |
| 05 | [05-hierarchical](05-hierarchical)         | Hierarchical .ctx              | How parent and child .ctx files merge and override.                |
| 06 | [06-gotchas-and-commands](06-gotchas-and-commands) | Gotchas and commands     | Warning developers about sharp edges and defining runnable commands.|
| 07 | [07-ignore-policies](07-ignore-policies)   | Ignore policies                | Preventing reads and logging of sensitive paths.                   |
| 08 | [08-profiles](08-profiles)                 | Workspace profiles             | Configuring per-repo budgets, agents, and policies.                |
| 09 | [09-drift-detection](09-drift-detection)   | Drift detection                | How ctxl detects stale references and proposes fixes.              |
| 10 | [10-proposals](10-proposals)               | Update proposals               | The propose, review, apply workflow for .ctx changes.              |
| 11 | [11-agent-wrapper](11-agent-wrapper)       | Agent wrapper                  | Using `ctxkit run` to wrap any coding agent.                       |
| 12 | [12-session-tracking](12-session-tracking) | Session tracking               | Session lifecycle, request events, and the daemon.                 |
| 13 | [13-refs-cross-linking](13-refs-cross-linking) | Cross-references           | Linking between .ctx files to avoid duplication.                   |
| 14 | [14-budget-tuning](14-budget-tuning)       | Budget and scoring             | Understanding the scoring formula and tuning token budgets.        |
| 15 | [15-full-project](15-full-project)         | Full real-world project        | A complete, realistic project setup with all features combined.    |

## .ctx File Format Quick Reference

Every `.ctx` file is a YAML document with `version: 1` at the top. All
sections are optional except `version` and `summary`:

```yaml
version: 1
summary: "Brief description of this directory's purpose"
key_files: [...]
contracts: [...]
decisions: [...]
commands: { ... }
gotchas: [...]
tags: [...]
refs: [...]
ignore: { never_read: [...], never_log: [...] }
```

See individual examples for detailed usage of each section.

## Common ctxkit Commands

```bash
ctxkit init                         # Initialize .ctx in current directory
ctxkit init src/auth                # Initialize .ctx in a subdirectory
ctxkit validate                     # Validate all .ctx files in the repo
ctxkit inject --preview             # Preview what context would be injected
ctxkit drift                        # Check for stale references
ctxkit propose                      # Generate update proposals
ctxkit apply <diff-id>              # Apply an approved proposal
ctxkit sessions                     # List active and recent sessions
ctxkit sessions show <id>           # Inspect a specific session
ctxkit daemon start                 # Start the background daemon
ctxkit dashboard                    # Open the local inspection dashboard
ctxkit run -- <agent-command>       # Wrap an agent with context injection
```
