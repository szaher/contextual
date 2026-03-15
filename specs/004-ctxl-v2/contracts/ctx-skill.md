# /ctx Skill Contracts: ctxl v2

**Branch**: `004-ctxl-v2` | **Date**: 2026-03-15

The `/ctx` skill is the primary agent interface for context management. `/ctxkit` continues to work as a backward-compatible alias.

---

## /ctx (no subcommand)

Display a status overview of the project's context state.

**Input**: None
**Output**:
```
📊 Context Status
  .ctx files: 12 (3 stale, 1 conflict)
  .ctxl index: up to date (12 entries)
  Token budget: 2500/4000 used
  Last update: 2 hours ago by agent:claude-opus
```

---

## /ctx show [path]

Display the contents of a .ctx file.

**Input**: Optional path (defaults to cwd .ctx)
**Output**: Formatted .ctx file contents with section headers
**Error**: "No .ctx file found at <path>"

---

## /ctx edit [path]

Open a .ctx file for interactive editing. Presents current contents and accepts section-by-section modifications.

**Input**: Optional path (defaults to cwd .ctx)
**Output**: Interactive editing session with diff preview
**Side effects**: Updates .ctx file, bumps version

---

## /ctx add <section> <args>

Add an entry to a specific section of the current .ctx file.

**Subcommands**:

### /ctx add key_file

```
/ctx add key_file path=<file> purpose="<description>" [tags=<comma-separated>]
```

**Example**: `/ctx add key_file path=src/auth/jwt.ts purpose="JWT token validation" tags=auth,jwt`
**Side effects**: Adds key_file entry, bumps version, updates index

### /ctx add contract

```
/ctx add contract name=<name> content="<text>" [scope.paths=<comma-separated>] [scope.tags=<comma-separated>]
```

### /ctx add decision

```
/ctx add decision id=<id> title="<title>" rationale="<text>" [status=accepted]
```

### /ctx add gotcha

```
/ctx add gotcha text="<warning text>" [tags=<comma-separated>]
```

### /ctx add tag

```
/ctx add tag <tag-value>
```

### /ctx add ref

```
/ctx add ref target=<path> sections=<comma-separated> reason="<text>"
```

### /ctx add command

```
/ctx add command <key>=<value>
```

**Output**: Confirmation with diff of what was added
**Side effects**: Updates .ctx file, bumps version, updates .ctxl index

---

## /ctx remove <section> <key>

Remove an entry from a specific section.

```
/ctx remove key_file <path>
/ctx remove contract <name>
/ctx remove decision <id>
/ctx remove gotcha <index>
/ctx remove tag <value>
/ctx remove ref <target>
/ctx remove command <key>
```

**Output**: Confirmation with diff of what was removed
**Side effects**: Updates .ctx file, bumps version, updates .ctxl index
**Error**: "Entry not found: <key> in section <section>"

---

## /ctx inject [tags...]

Build and inject a context pack for the current task.

**Input**: Optional tag filters
**Output**: Context pack with source attribution and reason codes

---

## /ctx index

Regenerate the .ctxl index for the repository.

**Output**: Index generation summary (entries, tokens, dependencies)
**Side effects**: Writes/updates .ctxl file

---

## /ctx bootstrap [path]

Analyze a directory and generate a .ctx file proposal.

**Input**: Optional path (defaults to cwd)
**Output**: Generated .ctx proposal for review
**Side effects**: Writes .ctx file (after approval), updates index

**Flow**:
1. Analyze directory
2. Present proposal
3. Wait for approval/rejection/edits
4. Write .ctx file if approved

---

## /ctx diff [path]

Show pending changes or version diff for a .ctx file.

**Input**: Optional path (defaults to cwd)
**Output**: Structured diff showing per-section changes

---

## /ctx resolve [path]

Walk through unresolved conflicts in a .ctx file.

**Input**: Optional path (if omitted, walks all files with conflicts)
**Output**: Interactive resolution for each conflict

**Per-conflict flow**:
1. Show conflict (section, key, both versions with authors)
2. Present options: pick ours, pick theirs, manual merge, keep both
3. Apply resolution
4. Move to next conflict

**Side effects**: Resolves conflicts, bumps version, updates index

---

## /ctx history [path] [n]

Show version history for a .ctx file.

**Input**: Optional path (defaults to cwd), optional count (defaults to 10)
**Output**: Chronological history entries with version, timestamp, author, diff_summary

---

## /ctx validate

Validate all .ctx files in the repository for consistency.

**Output**: Validation report (valid count, invalid count, issues found)
**Checks**:
- Schema validity
- Checksum matches
- Missing referenced files
- Dead references
- Constitution compliance (if constitution available)

---

## /ctx speckit <cmd>

Spec-kit integration commands.

### /ctx speckit import
Import constitution and specs into .ctx files.

### /ctx speckit export
Export .ctx content to spec-kit format.

### /ctx speckit validate
Validate .ctx files against constitution.

### /ctx speckit sync
Bidirectional sync between specs and .ctx.

(See CLI and daemon contracts for full parameter details)

---

## /ctx stale

Show .ctx files that are stale (haven't been updated recently).

**Output**: List of stale files with staleness reason (age, missing files, checksum mismatch)

---

## /ctx pr [--since REF]

Generate a PR context document from session data.

**Input**: Optional git ref for diff range
**Output**: Formatted PR context document (markdown)
**Side effects**: None (read-only)
