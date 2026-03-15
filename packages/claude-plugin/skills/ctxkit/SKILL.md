# /ctxkit — Context Management (Alias)

**Note**: `/ctxkit` is a backward-compatible alias for `/ctx`. All commands work identically.

For full documentation of all subcommands, see the `/ctx` skill.

## Quick Reference

- `/ctxkit` → `/ctx` (status)
- `/ctxkit inject` → `/ctx inject`
- `/ctxkit sessions` → `/ctx show`
- `/ctxkit memory search <query>` → `/ctx inject`
- `/ctxkit propose` → `/ctx edit`
- `/ctxkit apply <id>` → `/ctx add`
- `/ctxkit policy` → `/ctx validate`

## New v2 Subcommands (via /ctx)

- `/ctx index` — Regenerate .ctxl index
- `/ctx bootstrap [path]` — Generate .ctx files from code analysis
- `/ctx diff [path]` — Show version diffs
- `/ctx resolve [path]` — Resolve merge conflicts
- `/ctx history [path]` — View version history
- `/ctx stale` — Show stale .ctx files
- `/ctx pr` — Generate PR context document
- `/ctx speckit <cmd>` — Spec-kit integration
