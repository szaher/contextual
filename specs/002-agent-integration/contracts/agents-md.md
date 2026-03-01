# AGENTS.md Generation Contract: CtxKit Codex Adapter

**Feature**: 002-agent-integration
**Date**: 2026-03-01

## CLI Command

```
ctxkit codex sync-agents [--repo-root <path>] [--budget <tokens>] [--dry-run]
```

### Arguments

| Argument | Type | Default | Description |
|----------|------|---------|-------------|
| `--repo-root` | string | auto-detected | Repository root path |
| `--budget` | number | 8000 | Max tokens per AGENTS.md file |
| `--dry-run` | boolean | false | Show what would be written without writing |

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error (invalid repo, missing .ctx files, write failure) |

---

## Generated AGENTS.md Format

Each generated `AGENTS.md` file follows this structure:

```markdown
<!-- CTXKIT:BEGIN - Managed by CtxKit. Do not edit this section. -->
<!-- Generated: 2026-03-01T10:00:00Z | Source: .ctx hierarchy -->

## CtxKit Project Context

<summarized .ctx content for this directory>

### Key Files
- `auth.ts` — Main authentication module
- `db.ts` — Database connection and queries

### Decisions
- Use JWT for session tokens (decided 2026-02-15)

### Gotchas
- The config loader expects `.ctxl/config.yaml` to exist

## CtxKit Usage Policy

When working in this project, you have access to CtxKit tools for context and memory management.

### Preferred: MCP Tools
If CtxKit MCP server is available (check with `/mcp`), use these tools:
- `ctxkit.context_pack` — Get relevant context before responding
- `ctxkit.log_event` — Log tool calls for session tracking
- `ctxkit.propose_update` — Propose .ctx memory updates
- `ctxkit.memory.search` — Search project memory

### Fallback: CLI Commands
If MCP is unavailable, use the CLI directly:
- `ctxkit inject "<request>" --json` — Get context pack
- `ctxkit sessions list --json` — List sessions
- `ctxkit propose --json` — Propose updates

### Best Practices
- Call `ctxkit.context_pack(mode=turn)` before responding to user prompts
- Call `ctxkit.log_event` after each tool invocation
- Call `ctxkit.propose_update` when you learn something new about the project

<!-- CTXKIT:END -->
```

---

## Marker Protocol

CtxKit-managed content is delimited by:
- **Start marker**: `<!-- CTXKIT:BEGIN - Managed by CtxKit. Do not edit this section. -->`
- **End marker**: `<!-- CTXKIT:END -->`

### Rules

1. Content between markers is fully managed by CtxKit and will be overwritten on sync.
2. Content **outside** markers is user-written and MUST be preserved.
3. If no markers exist in an existing file, markers are appended at the end.
4. If the file does not exist, it is created with only the CtxKit section.

### Merge Behavior

```
Given existing AGENTS.md:

  # My Custom Instructions                    ← preserved
  Always use TypeScript strict mode.           ← preserved

  <!-- CTXKIT:BEGIN ... -->                    ← replaced
  (old CtxKit content)                         ← replaced
  <!-- CTXKIT:END -->                          ← replaced

  ## My Testing Rules                          ← preserved
  Run tests before committing.                 ← preserved

After sync:

  # My Custom Instructions                    ← preserved
  Always use TypeScript strict mode.           ← preserved

  <!-- CTXKIT:BEGIN ... -->                    ← new content
  (new CtxKit content)                         ← new content
  <!-- CTXKIT:END -->                          ← new content

  ## My Testing Rules                          ← preserved
  Run tests before committing.                 ← preserved
```

---

## Directory Walking

The sync command walks the `.ctx` hierarchy:

1. Start at repo root
2. Find all directories containing `.ctx` files
3. For each directory:
   a. Read `.ctx` file(s) via `parseCtxFile` from `@ctxl/core`
   b. Apply `redactSecrets` to all content
   c. Apply ignore policies (skip `never_read` paths)
   d. Generate summary within token budget
   e. Write/update `AGENTS.md` in that directory

### Token Budget Management

- Each `AGENTS.md` file respects the `--budget` flag (default 8000 tokens)
- The combined total across all files should stay under Codex's `project_doc_max_bytes` (32 KiB)
- Budget is divided: ~70% for project context, ~30% for usage policy block
- If content exceeds budget, lower-scored entries are omitted

---

## Idempotency

Running `ctxkit codex sync-agents` on unchanged `.ctx` files MUST produce zero-diff output (SC-010).

Implementation:
1. Before writing, compare generated content with existing CtxKit-managed section
2. If identical, skip the write entirely
3. Report "0 files updated" in dry-run output

---

## Secret Redaction

All generated content passes through `detectSecrets` and `redactSecrets` from `@ctxl/core`:
- API keys, tokens, passwords, connection strings → replaced with `[REDACTED]`
- `.env` file contents → never included
- Paths matching `never_read` or `never_log` ignore policies → excluded entirely
