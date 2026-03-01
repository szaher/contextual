# Core Concepts

This page explains the key concepts and mental model behind ctxl. Understanding these will help you write effective `.ctx` files and configure the system for your workflow.

## .ctx Files

A `.ctx` file is a YAML document that captures directory-level knowledge. It lives alongside the code it describes and is tracked in git, making it reviewable in pull requests like any other source file.

Each `.ctx` file contains structured sections:

| Section | Purpose |
|---------|---------|
| `summary` | 5-15 line overview of what matters in this directory |
| `key_files` | Map of file paths to their purposes, with tags and verification dates |
| `contracts` | API contracts, invariants, and interface definitions with scoped enforcement |
| `decisions` | Lightweight ADRs: decision, rationale, date, alternatives considered |
| `commands` | Build, test, run commands relevant to this directory |
| `gotchas` | Sharp edges, known issues, things that trip people up |
| `tags` | Retrieval tags for matching against request keywords |
| `refs` | Links to other `.ctx` files to inherit their entries |
| `ignore` | Paths to never read or never log |

Key properties:

- **Human-readable** -- plain YAML, editable in any text editor
- **Git-diffable** -- structured format produces clean, reviewable diffs
- **Scoped** -- each `.ctx` describes its own directory's domain
- **Hierarchical** -- directories inherit from parents, override where needed
- **Verifiable** -- each entry carries a `verified_at` field for staleness tracking

## Context Packs

A Context Pack is the assembled payload injected into an agent's prompt for a specific request. It is the output of the ctxl pipeline:

```
.ctx files --> merge hierarchy --> score entries --> apply budget --> Context Pack
```

A Context Pack contains:

- **Items** -- the selected memory entries, each with:
  - Content (the actual text)
  - Source path (which `.ctx` file it came from)
  - Section (key_files, contracts, decisions, etc.)
  - Score (computed relevance)
  - Token count
  - Reason codes (why it was included)
  - Staleness info

- **Omitted items** -- entries that were considered but excluded, with:
  - Content preview
  - Score
  - Exclusion reason (BUDGET_EXCEEDED, LOW_SCORE, IGNORED, STALE)

- **Budget accounting** -- total tokens used, budget limit, percentage used

Context Packs are **deterministic**: the same request text, working directory, and repository state always produce the same pack with the same ordering.

## Sessions

A session represents a sequence of agent interactions on your machine. When you run `ctxkit run -- agent-command`, ctxl creates a session that tracks:

- **Metadata** -- repo path, working directory, branch, agent identifier
- **Lifecycle** -- start time, end time, active/completed status
- **Events** -- each request within the session, including:
  - Request text
  - The Context Pack that was injected
  - Token usage
  - Deep-read decisions
  - Any proposals triggered

Sessions are stored in the daemon's SQLite database and can be inspected via the CLI (`ctxkit sessions`) or the dashboard.

## Proposals

When the system detects that a `.ctx` file should be updated -- because a file was renamed, an entry is stale, or a dead reference was found -- it generates a **proposal**. Proposals follow a strict lifecycle:

```
proposed --> reviewed --> approved/rejected --> applied
```

Key principles:

- **No silent rewrites** -- all `.ctx` changes require explicit user approval
- **Diff-based** -- proposals are presented as unified diffs showing exactly what would change
- **Secret-safe** -- diffs are scanned for secrets and redacted before display
- **Locked entries respected** -- proposals never modify locked/pinned entries (warnings are shown instead)

## Drift

Drift occurs when `.ctx` entries no longer match the actual state of the codebase. ctxl detects drift by cross-referencing `.ctx` content with git history:

| Drift Reason | Description |
|-------------|-------------|
| `file_deleted` | A referenced file no longer exists |
| `file_renamed` | A referenced file was renamed (detected via `git log --follow`) |
| `file_modified` | A referenced file has commits since its `verified_at` hash |
| `commit_unknown` | The `verified_at` commit hash cannot be found in git history |

Drift detection feeds into:

- **Scoring** -- stale entries receive lower recency scores (0.3 instead of 0.9)
- **Proposals** -- the system generates removal or update proposals for drifted entries
- **Deep-read** -- high staleness can trigger the deep-read fallback

## Profiles

Profiles control ctxl's behavior at multiple levels, with a clear precedence chain:

```
request overrides > agent config > workspace profile > global profile > defaults
```

| Level | Location | Scope |
|-------|----------|-------|
| Global | `~/.ctxl/config.yaml` | All repos on this machine |
| Workspace | `.ctxl/config.yaml` (in repo) | This repository |
| Agent | `agents:` section in workspace config | Per-agent within this repo |
| Request | CLI flags like `--budget` | Single invocation |

Profiles configure token budgets, scoring mode (lexical or hybrid), ignore policies, auto-approve rules, and retention periods.

## Reason Codes

Every item in a Context Pack carries one or more reason codes explaining why it was included:

| Code | Meaning |
|------|---------|
| `LOCALITY_HIGH` | The entry comes from a `.ctx` file close to the working directory (locality score >= 0.8) |
| `TAG_MATCH` | The entry's tags match keywords extracted from the request text |
| `PINNED` | The entry is locked/pinned by the user and gets a minimum score boost |
| `RECENT_EDIT` | The entry's file appears in the touched files list |
| `CONTRACT_REQUIRED` | The entry is a contract whose scope matches the request context |
| `DEEP_READ` | The entry was added by the deep-read fallback mechanism |

Omitted items carry exclusion reasons:

| Reason | Meaning |
|--------|---------|
| `BUDGET_EXCEEDED` | Adding this entry would exceed the token budget |
| `LOW_SCORE` | The entry's relevance score is too low |
| `IGNORED` | The entry matches an ignore policy |
| `STALE` | The entry is too stale to be useful |

## Deep-Read Fallback

When ctxl's confidence in `.ctx` content is low, it triggers a deep-read fallback that bypasses `.ctx` and reads actual files. The fallback is triggered when:

- No `.ctx` files exist in the hierarchy
- Zero tag matches across all scored entries
- The top-scoring entry has a score below 0.3
- The request text contains deep-analysis intent keywords like "refactor", "debug", "investigate", "root cause", or "trace"

Deep-read decisions are logged in the session timeline and visible in the dashboard, with a rationale explaining why the fallback was triggered.

## Next Steps

- Learn the [.ctx File Format](/guide/ctx-format) in detail
- Understand [Hierarchical Contexts](/guide/hierarchical-contexts) and merge rules
- Dive into the [Scoring Algorithm](/guide/scoring-algorithm) mechanics
