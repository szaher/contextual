# Example 07: Ignore Policies

## What This Demonstrates

The `ignore` section defines which files ctxl must never read and which
files it must never log. These policies enforce security and privacy
boundaries that override all other heuristics -- no scoring, tagging,
or agent request can bypass them.

## Two Levels of Protection

### never_read

Files matching `never_read` patterns are completely invisible to ctxl:
- They are excluded from context assembly
- They are not scanned for drift detection
- They are not indexed for tag matching
- Agents cannot request them through ctxl

Use `never_read` for:
- Environment files with credentials (`.env`, `.env.production`)
- Private keys and certificates (`*.key`, `*.pem`)
- Terraform state files (contain plaintext secrets)
- Vendor directories (not sensitive, but noisy and wasteful)

### never_log

Files matching `never_log` patterns can be read for context assembly
(if not also in `never_read`), but their content is redacted before
being written to:
- Session logs
- Audit trails
- Proposed `.ctx` updates
- Any persistent storage

Use `never_log` for:
- Test fixtures with synthetic PII
- Database seed files
- Internal security documentation (readable by agents, but not stored
  in logs)

### Implicit Behavior

All `never_read` paths are implicitly `never_log` as well. If a file
cannot be read, it certainly cannot be logged.

## Pattern Syntax

Patterns use glob syntax:

| Pattern              | Matches                                      |
|----------------------|----------------------------------------------|
| `.env`               | Exact file name `.env` in any directory       |
| `.env.*`             | `.env.local`, `.env.production`, etc.         |
| `*.key`              | Any file ending in `.key`                     |
| `secrets/`           | The entire `secrets/` directory recursively   |
| `config/prod*.yaml`  | `config/production.yaml`, `config/prod.yaml`  |

## Policy Inheritance

Ignore policies grow monotonically up the directory tree. A child `.ctx`
can add to the ignore list but cannot remove entries from a parent's
ignore list.

```
Root .ctx:    never_read: [".env", "node_modules/"]
Child .ctx:   never_read: ["*.key"]
Effective:    never_read: [".env", "node_modules/", "*.key"]
```

This ensures that security policies set at the root level cannot be
overridden by subdirectory context files.

## Workspace-Level Policies

In addition to per-directory ignore policies in `.ctx` files, you can
define global policies in `.ctxl/config.yaml` (see Example 08):

```yaml
# .ctxl/config.yaml
ignore:
  never_read:
    - ".env"
    - "secrets/"
    - "node_modules/"
  never_log:
    - ".env"
```

Workspace-level policies are merged with per-directory policies using
the same deny-list union semantics.

## Commands to Try

### Validate that ignore policies are active

```bash
ctxkit validate
```

Expected output:

```
Checking .ctx ...
Ignore policies active:
  never_read: 12 patterns
  never_log: 5 patterns
All .ctx files valid. 0 errors, 0 warnings.
```

### Preview context and verify exclusions

```bash
ctxkit inject --preview \
  --request "check the Stripe API key configuration" \
  --budget 4000
```

Even though the request mentions "API key", the context system will not
read `.env` or any `*.key` files. The Context Pack will include the
`payment-gateway.ts` key_files entry and the summary, but no secrets.

### Check what is excluded

```bash
ctxkit inject --preview --verbose \
  --request "debug the production config" \
  --budget 4000
```

With `--verbose`, the output includes a section showing which files were
excluded by ignore policies:

```
Excluded by ignore policy:
  [never_read] .env
  [never_read] .env.production
  [never_read] config/production.yaml
  [never_read] secrets/stripe.key
```

## Secret Redaction

Beyond ignore policies, ctxl also has built-in secret detection. If an
automated update proposal contains content that matches known credential
patterns (API keys, tokens, connection strings), the system redacts that
content before presenting the proposal.

This is a defense-in-depth measure: ignore policies prevent reading
secrets, and redaction catches any that slip through.

## Best Practices

- **Start with a standard set**: Every project should have at least:
  ```yaml
  ignore:
    never_read: [".env", ".env.*", "*.key", "*.pem", "node_modules/"]
    never_log: [".env"]
  ```

- **Use workspace-level policies for consistency**: Define common
  ignore patterns in `.ctxl/config.yaml` so they apply across all
  `.ctx` files in the repository.

- **Include build artifacts**: `dist/`, `coverage/`, and `.git/` are
  not sensitive but waste tokens. Add them to `never_read`.

- **Audit your policies**: Periodically review your ignore patterns
  to ensure new sensitive files are covered. The `ctxkit validate`
  command can help identify files that look sensitive but are not
  covered by policies.

- **Do not over-restrict**: Ignoring too many files makes ctxl less
  useful. Only ignore files that are genuinely sensitive or wasteful.
  Source code files should generally be readable.
