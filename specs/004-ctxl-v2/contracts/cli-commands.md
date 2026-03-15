# CLI Command Contracts: ctxl v2

**Branch**: `004-ctxl-v2` | **Date**: 2026-03-15

All commands support `--json` for machine-readable output. All commands exit 0 on success, 1 on error.

---

## ctxkit index

Manage the .ctxl index.

### `ctxkit index generate`

Generate or regenerate the .ctxl index for the current repository.

```
Usage: ctxkit index generate [options]

Options:
  --repo-root <path>    Repository root (default: git root)
  --force               Regenerate from scratch (ignore existing index)
  --json                Output as JSON
```

**Input**: Repository root path
**Output**: Generated index summary (entries count, total tokens, dependencies found)
**Side effects**: Writes `.ctxl` file at repository root
**Error cases**:
- Not a git repository → exit 1, "Not a git repository"
- No .ctx files found → exit 0, writes empty index with warning

### `ctxkit index select`

Select .ctx files for a task using the index.

```
Usage: ctxkit index select [options]

Options:
  --prompt <text>       Task description for relevance scoring
  --cwd <path>          Working directory (default: process.cwd())
  --budget <tokens>     Token budget (default: from .ctxl or 4000)
  --pin <paths...>      Always include these .ctx files
  --exclude <paths...>  Never include these .ctx files
  --json                Output as JSON
```

**Input**: Prompt text, working directory, budget, pins, exclusions
**Output**: Selected .ctx files with scores, reasons, budget usage; omitted files with exclusion reasons
**Side effects**: None (read-only)
**Error cases**:
- No .ctxl index found → exit 1, "No .ctxl index found. Run 'ctxkit index generate' first."

### `ctxkit index show`

Display the current .ctxl index.

```
Usage: ctxkit index show [options]

Options:
  --json                Output as JSON
```

**Output**: Index contents (entries, graph, policies, scoring config)

---

## ctxkit history

View version history for .ctx files.

### `ctxkit history <path>`

```
Usage: ctxkit history <path> [options]

Options:
  -n, --count <n>       Number of entries to show (default: 20)
  --all                 Include archived entries
  --diff <v1>..<v2>     Show diff between two versions
  --json                Output as JSON
```

**Input**: Path to .ctx file (or directory containing .ctx)
**Output**: History entries (version, timestamp, author, reason, diff_summary)
**Side effects**: None (read-only)
**Error cases**:
- File not found → exit 1, "No .ctx file found at <path>"
- No history → exit 0, "No version history (file is at version 1)"
- Invalid diff range → exit 1, "Invalid version range: <range>"

---

## ctxkit conflicts

Manage merge conflicts in .ctx files.

### `ctxkit conflicts list`

```
Usage: ctxkit conflicts list [options]

Options:
  --repo-root <path>    Repository root (default: git root)
  --json                Output as JSON
```

**Output**: List of files with conflicts, conflict count per file, and conflict details

### `ctxkit conflicts resolve <path>`

```
Usage: ctxkit conflicts resolve <path> [options]

Options:
  --section <name>      Resolve only conflicts in this section
  --pick <ours|theirs>  Auto-pick one side for all conflicts
  --json                Output as JSON
```

**Input**: Path to .ctx file with conflicts
**Output**: Resolution summary (resolved count, remaining count)
**Side effects**: Updates .ctx file, bumps version, updates .ctxl index
**Error cases**:
- No conflicts → exit 0, "No conflicts found in <path>"
- File not found → exit 1, "No .ctx file found at <path>"

---

## ctxkit bootstrap

Bootstrap .ctx files for directories.

### `ctxkit bootstrap [path]`

```
Usage: ctxkit bootstrap [path] [options]

Options:
  --mode <quick|full>   Analysis mode (default: quick)
  --dry-run             Show what would be generated without writing
  --skip-existing       Skip directories that already have .ctx files
  --min-files <n>       Minimum files in directory to qualify (default: 3)
  --json                Output as JSON
```

**Input**: Target path (default: repo root for recursive bootstrap)
**Output**: Generated .ctx files as proposals (or preview in dry-run mode)
**Side effects**: Writes .ctx files (unless --dry-run), updates .ctxl index
**Error cases**:
- Not a git repository → exit 1
- No qualifying directories found → exit 0, "No qualifying directories found"

---

## ctxkit speckit

Spec-kit integration bridge commands.

### `ctxkit speckit import`

```
Usage: ctxkit speckit import [options]

Options:
  --constitution <path>   Path to constitution file
  --specs <dir>           Path to spec-kit specs directory
  --dry-run               Preview changes without writing
  --json                  Output as JSON
```

**Output**: Import summary (decisions imported, contracts created, gotchas added)
**Side effects**: Updates .ctx files with imported content, bumps versions

### `ctxkit speckit export`

```
Usage: ctxkit speckit export [options]

Options:
  --output <dir>        Output directory for spec-kit files
  --format <md|yaml>    Output format (default: md)
  --json                Output as JSON
```

**Output**: Exported file list
**Side effects**: Writes spec-kit files to output directory

### `ctxkit speckit validate`

```
Usage: ctxkit speckit validate [options]

Options:
  --constitution <path>   Path to constitution file
  --json                  Output as JSON
```

**Output**: Validation results (pass/fail per .ctx file, violations with principle references)

### `ctxkit speckit sync`

```
Usage: ctxkit speckit sync [options]

Options:
  --dry-run             Preview changes without writing
  --force <direction>   Force sync direction (spec-to-ctx | ctx-to-spec)
  --json                Output as JSON
```

**Output**: Sync summary (files updated, conflicts detected)

---

## ctxkit pr

Generate PR context documents.

### `ctxkit pr [options]`

```
Usage: ctxkit pr [options]

Options:
  --session <id>        Specific session ID
  --branch              Use current branch (all sessions since merge-base)
  --since <ref>         Git ref to diff from (default: merge-base with main)
  --format <md|json>    Output format (default: md)
  --link-specs          Cross-reference spec-kit artifacts
  --gh                  Pipe-friendly output for gh pr create --body-file -
  --json                Output as JSON
```

**Output**: PR context document (markdown or JSON)
**Side effects**: None (read-only)
**Error cases**:
- No session data found → exit 0, "No session data found for the specified range"
- Daemon not running → exit 1, "Daemon not running. Start with 'ctxkit daemon start'"

---

## ctxkit migrate

Migrate v1 repository to v2.

### `ctxkit migrate [options]`

```
Usage: ctxkit migrate [options]

Options:
  --dry-run             Preview changes without writing
  --json                Output as JSON
```

**Output**: Migration summary (files processed, versions initialized, histories created, index generated)
**Side effects**: Updates .ctx files (add _history, set version), generates .ctxl index. Idempotent.
**Error cases**:
- Not a git repository → exit 1
- No .ctx files found → exit 0, "No .ctx files found to migrate"

---

## ctxkit hooks

Git hook management.

### `ctxkit hooks init`

```
Usage: ctxkit hooks init [options]

Options:
  --force               Overwrite existing hooks
```

**Output**: Installed hooks list
**Side effects**: Writes git hooks to `.git/hooks/`
**Error cases**:
- Not a git repository → exit 1
- Hooks already exist (without --force) → exit 1, "Hooks already exist. Use --force to overwrite."
