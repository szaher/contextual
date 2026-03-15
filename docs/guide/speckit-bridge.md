# Spec-Kit Integration

The `@ctxkit/speckit-bridge` package provides bidirectional synchronization between ctxl `.ctx` files and Spec-Kit specifications. This allows teams that use Spec-Kit for formal requirements to keep their context memory aligned with their specification documents.

## What Spec-Kit Is

Spec-Kit is a specification management system that organizes project requirements into:

- **Constitution** -- top-level principles and rules (MUST, SHALL, SHOULD clauses)
- **Component specs** -- per-component functional requirements, edge cases, and constraints

The bridge maps these concepts to ctxl's `.ctx` structure, enabling context memory to stay synchronized with formal specifications.

## Import

### Constitution Import

Constitution MUST and SHALL clauses are imported as locked decisions and contracts:

```bash
ctxkit speckit import --source constitution.yaml

# Output
Importing constitution.yaml...
  Imported 5 MUST clauses as locked decisions
  Imported 3 SHALL clauses as contracts
  Created 2 new .ctx files, updated 1 existing

Applied changes:
  .ctx:
    +decisions/CONST-001 (locked): "All API responses MUST include request tracing headers"
    +decisions/CONST-002 (locked): "Authentication MUST use short-lived JWT tokens"
    +contracts/security-policy: "All endpoints SHALL validate authorization..."
```

**Mapping rules:**

| Spec-Kit Element | ctxl Target | Properties |
|-----------------|------------|------------|
| MUST clause | `decisions` entry | `locked: true`, tagged with source clause ID |
| SHALL clause | `contracts` entry | `locked: true`, scope derived from clause context |
| SHOULD clause | `gotchas` entry | Advisory, not locked |

### Component Spec Import

Component specifications are imported into directory-level `.ctx` files:

```bash
ctxkit speckit import --source specs/auth-component.yaml

# Output
Importing specs/auth-component.yaml...
  Target: src/auth/.ctx
  Imported 4 functional requirements as contracts
  Imported 2 edge cases as gotchas

Applied changes:
  src/auth/.ctx:
    +contracts/auth-req-001: "Login must support email and OAuth providers"
    +contracts/auth-req-002: "Session tokens must expire after 24 hours"
    +gotchas/edge-case-001: "OAuth callback may arrive after token expiry"
    +gotchas/edge-case-002: "Email verification links expire after 48 hours"
```

**Mapping rules:**

| Spec-Kit Element | ctxl Target | Properties |
|-----------------|------------|------------|
| Functional requirement | `contracts` entry | Scope paths set from component directory |
| Edge case | `gotchas` entry | Tagged with component name |
| Constraint | `contracts` entry | `locked: true` |

## Export

Export `.ctx` files back to Spec-Kit format:

```bash
# Export as markdown
ctxkit speckit export --format md

# Export as YAML
ctxkit speckit export --format yaml --output specs/

# Output
Exporting .ctx files to Spec-Kit format...
  Exported 12 .ctx files
  Generated 3 component specs
  Generated 1 constitution fragment

Output: specs/
  specs/constitution-fragment.yaml
  specs/auth-component.yaml
  specs/db-component.yaml
  specs/api-component.yaml
```

**Export mapping:**

| ctxl Section | Spec-Kit Target |
|-------------|----------------|
| Locked decisions | Constitution MUST clauses |
| Contracts | Component functional requirements |
| Gotchas | Component edge cases |
| Summary | Component description |

## Validation

Validate that `.ctx` files comply with constitution principles:

```bash
ctxkit speckit validate --constitution constitution.yaml

# Output (all valid)
Validating .ctx files against constitution...
  Checked 12 .ctx files against 8 principles
  All files comply.

# Output (violations found)
Validating .ctx files against constitution...
  Checked 12 .ctx files against 8 principles

  Violations:
    src/auth/.ctx:
      CONST-003: "All endpoints SHALL implement rate limiting"
        No matching contract found in scope ["src/auth/**"]

    src/api/.ctx:
      CONST-001: "All API responses MUST include request tracing headers"
        Contract exists but content does not mention tracing headers

  2 violation(s) found
```

Validation checks:

1. Every MUST clause has a corresponding locked decision in a `.ctx` file whose scope covers the relevant directories
2. Every SHALL clause has a corresponding contract with matching scope
3. Contract content includes the key terms from the clause

## Sync

Bidirectional sync compares timestamps and resolves differences:

```bash
ctxkit speckit sync --source specs/ --direction both

# Output
Syncing .ctx files with specs/...
  Comparing timestamps...

  Spec newer (update .ctx):
    specs/auth-component.yaml -> src/auth/.ctx
      +contracts/auth-req-003: "MFA must support TOTP and WebAuthn"

  .ctx newer (update spec):
    src/db/.ctx -> specs/db-component.yaml
      Contract db-query-perf updated (content changed)

  Conflicts (manual resolution required):
    src/api/.ctx <-> specs/api-component.yaml
      Contract api-versioning modified on both sides
      Use --pick spec or --pick ctx to resolve

  Applied 1 .ctx update, 1 spec update
  1 conflict requires manual resolution
```

### Sync Direction

| Direction | Behavior |
|-----------|----------|
| `--direction spec-to-ctx` | Only update `.ctx` files from specs |
| `--direction ctx-to-spec` | Only update specs from `.ctx` files |
| `--direction both` | Bidirectional sync with conflict detection |

### Conflict Detection

When both sides have been modified since the last sync, the bridge detects a conflict. Conflicts can be resolved with:

```bash
# Prefer spec-kit version
ctxkit speckit sync --source specs/ --pick spec

# Prefer .ctx version
ctxkit speckit sync --source specs/ --pick ctx
```

## CLI Reference

### `ctxkit speckit import`

Import Spec-Kit documents into `.ctx` files.

| Option | Default | Description |
|--------|---------|-------------|
| `--source <path>` | (required) | Path to Spec-Kit document or directory |
| `--dry-run` | `false` | Preview without writing |
| `--target <dir>` | (auto-detected) | Target directory for generated `.ctx` files |

### `ctxkit speckit export`

Export `.ctx` files to Spec-Kit format.

| Option | Default | Description |
|--------|---------|-------------|
| `--format <fmt>` | `yaml` | Output format: `yaml` or `md` |
| `--output <dir>` | `specs/` | Output directory |
| `--filter <path>` | (all) | Only export `.ctx` files matching this path prefix |

### `ctxkit speckit validate`

Validate `.ctx` files against a constitution.

| Option | Default | Description |
|--------|---------|-------------|
| `--constitution <path>` | (required) | Path to the constitution document |
| `--strict` | `false` | Treat SHOULD violations as errors |

### `ctxkit speckit sync`

Bidirectional sync between `.ctx` files and Spec-Kit documents.

| Option | Default | Description |
|--------|---------|-------------|
| `--source <path>` | (required) | Path to Spec-Kit documents directory |
| `--direction <dir>` | `both` | Sync direction: `spec-to-ctx`, `ctx-to-spec`, or `both` |
| `--pick <side>` | (none) | Resolve conflicts by picking a side: `spec` or `ctx` |
| `--dry-run` | `false` | Preview without writing |

## Next Steps

- Learn about the [.ctx File Format](/guide/ctx-format) and how imported data maps to it
- Understand [Contracts](/guide/contracts) and how imported constraints are enforced
- See [Conflict Resolution](/guide/conflict-resolution) for handling sync conflicts
