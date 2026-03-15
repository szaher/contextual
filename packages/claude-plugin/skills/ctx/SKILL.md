# /ctx — Context Management Skill (v2)

Use `/ctx` to manage .ctx context files, the .ctxl index, versioning, conflicts, and integrations.

## Subcommands

### `/ctx` (status)
Display project context status overview.

**MCP-first**: Call `ctxkit.context_pack` with `mode: "status"`, or read `.ctxl` index directly.

### `/ctx show [path]`
Display contents of a .ctx file (defaults to cwd).

**MCP-first**: Call `ctxkit.context_pack` with the target path.
**CLI fallback**: `ctxkit inject --json`

### `/ctx edit [path]`
Open a .ctx file for interactive editing with diff preview.

**Flow**: Read file → present contents → accept modifications → write with version bump.

### `/ctx add <section> <args>`
Add an entry to a .ctx file section.

**Sections**: key_file, contract, decision, gotcha, tag, ref, command

**Examples**:
- `/ctx add key_file path=src/auth/jwt.ts purpose="JWT validation" tags=auth,jwt`
- `/ctx add tag security`
- `/ctx add decision id=ADR-001 title="Use JWT" rationale="Industry standard"`
- `/ctx add gotcha text="Tokens expire after 1h" tags=auth`

**MCP-first**: Call `ctxkit.ctx_write` with the updates object.

### `/ctx remove <section> <key>`
Remove an entry from a .ctx file section.

**Examples**:
- `/ctx remove key_file src/auth/old.ts`
- `/ctx remove tag deprecated`

**MCP-first**: Call `ctxkit.ctx_write` with removal updates.

### `/ctx inject [tags...]`
Build and inject a context pack for the current task.

**MCP-first**: Call `ctxkit.context_pack` tool.
**CLI fallback**: `ctxkit inject "task description" --json`

### `/ctx index`
Regenerate the .ctxl index for the repository.

**MCP-first**: Call `ctxkit.index_generate` tool.
**CLI fallback**: `ctxkit index generate --json`

### `/ctx bootstrap [path]`
Analyze a directory and generate a .ctx file proposal.

**MCP-first**: Call `ctxkit.ctx_bootstrap` tool with `dry_run: true` first.
**CLI fallback**: `ctxkit bootstrap --dry-run --json`

### `/ctx diff [path]`
Show version diff for a .ctx file.

**MCP-first**: Call `ctxkit.ctx_history` tool.
**CLI fallback**: `ctxkit history <path> --diff v1..v2 --json`

### `/ctx resolve [path]`
Walk through unresolved conflicts in .ctx files interactively.

**Flow per conflict**:
1. Show conflict (section, key, both versions with authors)
2. Present options: pick ours, pick theirs, manual merge, keep both
3. Apply resolution and move to next

**CLI fallback**: `ctxkit conflicts list --json` then `ctxkit conflicts resolve <path> --pick ours|theirs --json`

### `/ctx history [path] [n]`
Show version history for a .ctx file.

**MCP-first**: Call `ctxkit.ctx_history` tool.
**CLI fallback**: `ctxkit history <path> --count <n> --json`

### `/ctx validate`
Validate all .ctx files for schema, checksums, and references.

**CLI fallback**: `ctxkit validate --json`

### `/ctx speckit <cmd>`
Spec-kit integration bridge.

**Subcommands**: import, export, validate, sync

**CLI fallback**: `ctxkit speckit <cmd> --json`

### `/ctx stale`
Show .ctx files that are stale (not updated recently or checksum mismatch).

**CLI fallback**: `ctxkit drift --json`

### `/ctx pr [--since REF]`
Generate a PR context document from session data.

**MCP-first**: Call `ctxkit.pr_generate` tool.
**CLI fallback**: `ctxkit pr --json`

## Usage Notes

- MCP tools are preferred — they go through the daemon with structured responses.
- Fall back to CLI if MCP server is unavailable.
- All CLI commands support `--json` for machine-readable output.
- `/ctxkit` continues to work as a backward-compatible alias for `/ctx`.
- `$CTXKIT_SESSION_ID` is set automatically by the SessionStart hook.
