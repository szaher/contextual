# Example 05: Hierarchical .ctx Files

## What This Demonstrates

How `.ctx` files at different directory levels work together. ctxl loads
`.ctx` files from the current working directory up through parent
directories to the repo root, with child entries taking precedence over
parent entries for overlapping topics.

This example has three `.ctx` files:

```
.ctx                  # Root -- project-wide context
backend/.ctx          # Backend-specific overrides
frontend/.ctx         # Frontend-specific context
```

## Hierarchical Loading

When working in `backend/`, ctxl loads:

1. `backend/.ctx` (highest priority -- closest to working directory)
2. `.ctx` (root -- lowest priority)

When working in `frontend/`, ctxl loads:

1. `frontend/.ctx` (highest priority)
2. `.ctx` (root -- lowest priority)

When working at the root level, only `.ctx` is loaded.

## Merge Rules

Each section has specific merge behavior:

| Section      | Merge Behavior                                            |
|--------------|-----------------------------------------------------------|
| `summary`    | Child replaces parent (no merge)                          |
| `key_files`  | Union; child overrides parent if same `path`              |
| `contracts`  | Union; child overrides parent if same `name`              |
| `decisions`  | Union; child overrides parent if same `id`                |
| `commands`   | Child overrides parent if same key                        |
| `gotchas`    | Concatenated (child entries listed first)                 |
| `tags`       | Union of all tags from all levels                         |
| `ignore`     | Union (deny-list grows as you go up the tree)             |

### Example: Command Override

The root `.ctx` defines:
```yaml
commands:
  build: "pnpm build"
  test: "pnpm test"
```

The `backend/.ctx` overrides:
```yaml
commands:
  build: "pnpm build:backend"
  test: "pnpm test:backend"
  migrate: "pnpm prisma migrate dev"    # new command, not in root
```

When working in `backend/`, the effective commands are:
```yaml
commands:
  build: "pnpm build:backend"           # overridden by child
  test: "pnpm test:backend"             # overridden by child
  dev: "pnpm dev"                       # inherited from root
  lint: "pnpm lint"                     # inherited from root
  migrate: "pnpm prisma migrate dev"    # added by child
```

### Example: Tags Union

Root tags: `[fullstack, typescript, monorepo]`
Backend tags: `[backend, express, postgresql, api]`

Effective tags when in `backend/`:
`[fullstack, typescript, monorepo, backend, express, postgresql, api]`

### Example: Gotchas Concatenation

Root has a WebSocket gotcha. Frontend has a WebSocket reconnection gotcha.
When in `frontend/`, both gotchas are available, with the frontend-specific
one listed first (child gotchas have higher priority).

## Commands to Try

### Preview context from the backend directory

```bash
ctxkit inject --preview \
  --request "add a new REST endpoint for project deletion" \
  --cwd ./backend \
  --budget 4000
```

Expected output:

```
Context Pack (1,250 / 4,000 tokens)

Included (5 items):
  1. [CONTRACT_REQUIRED] backend/.ctx -> contracts/api-response-format (180 tok)
  2. [LOCALITY_HIGH]     backend/.ctx -> summary (140 tok)
  3. [LOCALITY_HIGH]     backend/.ctx -> key_files/server.ts (65 tok)
  4. [TAG_MATCH]         backend/.ctx -> commands (95 tok)
  5. [LOCALITY_HIGH]     .ctx -> decisions/d001 (120 tok)

Omitted (3 items):
  - .ctx -> gotchas/0 (score: 0.32, reason: LOW_SCORE)
  - .ctx -> key_files/package.json (score: 0.20, reason: LOW_SCORE)
  - backend/.ctx -> key_files/src/ws.ts (score: 0.18, reason: LOW_SCORE)
```

Notice:
- Backend entries score highest (locality)
- The root decision about monorepo structure is inherited
- The backend commands override the root commands
- The API response format contract is triggered by the "api" tag

### Preview context from the frontend directory

```bash
ctxkit inject --preview \
  --request "fix the WebSocket reconnection bug" \
  --cwd ./frontend \
  --budget 4000
```

Expected output shows frontend-specific context with the frontend gotcha
about WebSocket reconnection, plus the root gotcha about WebSocket drops.
Both are relevant and both are included.

### Compare effective context at different levels

```bash
# From root -- sees only root .ctx
ctxkit inject --preview --request "how is the project structured?" --cwd .

# From backend -- sees backend + root merged
ctxkit inject --preview --request "how is the project structured?" --cwd ./backend

# From frontend -- sees frontend + root merged
ctxkit inject --preview --request "how is the project structured?" --cwd ./frontend
```

## Best Practices

- **Put shared knowledge in the root .ctx**: Decisions, project-wide
  gotchas, and global commands belong at the root level.

- **Put module-specific knowledge in child .ctx files**: Contracts,
  local key files, and module-specific commands belong in subdirectories.

- **Do not duplicate entries**: If a decision applies everywhere, put it
  in the root. Do not copy it into every subdirectory. Child `.ctx` files
  inherit from parents automatically.

- **Use override deliberately**: When a child defines the same command
  key, decision ID, or contract name as the parent, the child wins.
  This is useful for specialization but can cause confusion if overused.

- **Keep the hierarchy shallow**: Two to three levels of `.ctx` is
  typical. Deeply nested hierarchies (5+ levels) make it hard to
  understand what context an agent will see.
