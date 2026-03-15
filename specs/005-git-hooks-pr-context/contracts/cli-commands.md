# CLI Command Contracts: Git Hooks

## `ctxkit hooks init`

**Extended behavior** (adds prepare-commit-msg to existing pre-commit + post-commit):

```
ctxkit hooks init [--context-trailers] [--force]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--context-trailers` | true | Install the prepare-commit-msg hook for context trailer injection |
| `--force` | false | Overwrite existing prepare-commit-msg hook instead of chaining |

**Output (success)**:
```
Installed git hooks:
  ✓ pre-commit (validate .ctx files)
  ✓ post-commit (regenerate .ctxl index)
  ✓ prepare-commit-msg (inject context trailers)
```

**Output (chained)**:
```
Installed git hooks:
  ✓ pre-commit (validate .ctx files)
  ✓ post-commit (regenerate .ctxl index)
  ✓ prepare-commit-msg (chained with existing hook)
```

**Exit codes**: 0 = success, 1 = not a git repo, 2 = permission error

---

## `ctxkit hooks remove`

```
ctxkit hooks remove [--all] [--context-trailers]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--all` | false | Remove all ctxkit hooks |
| `--context-trailers` | false | Remove only the prepare-commit-msg hook |

**Output**:
```
Removed git hooks:
  ✓ prepare-commit-msg (restored original hook)
```

---

## `ctxkit hooks status`

```
ctxkit hooks status [--json]
```

**Output (text)**:
```
Git hooks status:
  pre-commit:         installed (v0.2.0)
  post-commit:        installed (v0.2.0)
  prepare-commit-msg: installed (v0.2.0)
  other hooks:        none detected
```

**Output (JSON)**:
```json
{
  "pre_commit": { "status": "installed", "version": "0.2.0" },
  "post_commit": { "status": "installed", "version": "0.2.0" },
  "prepare_commit_msg": { "status": "installed", "version": "0.2.0", "chained": false },
  "other_hooks": []
}
```

---

## `ctxkit hooks inject-trailers` *(internal)*

Called by the `prepare-commit-msg` hook script — not intended for direct user invocation.

```
ctxkit hooks inject-trailers <msg-file>
```

| Argument | Required | Description |
|----------|----------|-------------|
| `msg-file` | Yes | Path to the commit message file (passed by git as `$1` to `prepare-commit-msg`) |

**Behavior**:
1. Reads the commit message file
2. Queries daemon for active session (200ms timeout, skip on failure)
3. Checks `git diff --cached --name-only` for staged `.ctx` files
4. If no active session and no `.ctx` files staged → no-op (exit 0)
5. Formats trailers using `formatTrailers()` with `redactSecrets()` applied
6. Appends trailers to the message file (truncates `Ctxkit-Files` if message would exceed 72KB)

**Exit codes**: 0 = success or no-op, non-zero = error (hook script catches and exits 0)

---

## `ctxkit dashboard`

```
ctxkit dashboard [--port <port>] [--no-open]
```

| Flag | Default | Description |
|------|---------|-------------|
| `--port` | 4117 | Port to serve dashboard on |
| `--no-open` | false | Don't auto-open browser |

**Output**:
```
Dashboard available at http://localhost:4117
Press Ctrl+C to stop
```

**Behavior**: Starts daemon if not running, serves UI static files, opens browser.
