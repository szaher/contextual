# Example 23: Spec-Kit Integration

ctxl integrates with spec-kit, a specification management system for
software projects. The spec-kit bridge imports constitutional decisions
(CONST- prefixed) and functional requirements (FR- prefixed) from spec-kit
documents into `.ctx` files as locked contracts and decisions. This enables
bidirectional sync: changes in spec-kit flow into `.ctx` files, and changes
in `.ctx` files can be exported back to spec-kit.

## What This Demonstrates

- Importing a spec-kit constitution into `.ctx` contracts
- Importing component specs (functional requirements) into `.ctx` decisions and contracts
- Bidirectional sync between spec-kit and ctxl
- Conflict detection when spec-kit and `.ctx` files diverge
- Validation of `.ctx` files against spec-kit specifications
- The `ctxkit speckit` command family

## Files in This Example

- **`specs/constitution.md`** -- A spec-kit constitution document with CONST-
  prefixed decisions that define project-wide invariants.
- **`specs/auth.md`** -- A spec-kit component spec for the auth module with
  FR- prefixed functional requirements.
- **`.ctx`** -- The resulting `.ctx` file after importing from spec-kit, with
  locked contracts derived from CONST- decisions and FR- requirements.
- **`.ctxl/speckit.yaml`** -- Configuration for the spec-kit bridge, including
  sync settings and mapping rules.

## How the Bridge Works

### Constitution Import

A spec-kit constitution contains CONST- prefixed decisions that are
project-wide invariants. When imported, each CONST- decision becomes a
locked contract in the root `.ctx` file:

```
spec-kit constitution.md          ->    .ctx contracts
-------------------------------        ---------------------------
CONST-001: All APIs use REST       ->   contract: "const-001-rest-api"
CONST-002: Auth via JWT            ->   contract: "const-002-jwt-auth"
CONST-003: Zod for validation      ->   contract: "const-003-zod-validation"
```

### Component Spec Import

A spec-kit component spec contains FR- prefixed functional requirements.
When imported, each FR- requirement becomes a contract scoped to the
relevant module:

```
spec-kit auth.md                   ->    src/auth/.ctx contracts
-------------------------------        ---------------------------
FR-AUTH-001: bcrypt hashing         ->   contract: "fr-auth-001-bcrypt"
FR-AUTH-002: Token expiry           ->   contract: "fr-auth-002-token-expiry"
FR-AUTH-003: Rate limiting          ->   contract: "fr-auth-003-rate-limit"
```

### Bidirectional Sync

The bridge supports two-way synchronization:

| Direction          | Command                     | Behavior                          |
|--------------------|-----------------------------|-----------------------------------|
| spec-kit -> ctxl   | `ctxkit speckit import`     | Creates/updates contracts in .ctx |
| ctxl -> spec-kit   | `ctxkit speckit export`     | Writes .ctx contracts back to specs |
| Both               | `ctxkit speckit sync`       | Detects drift in both directions  |

### Conflict Detection

When `ctxkit speckit sync` detects that both the spec-kit document and the
`.ctx` file have changed since the last sync, it reports a conflict:

```
Conflict: CONST-001 (All APIs use REST)
  spec-kit: "All public APIs MUST use RESTful conventions with JSON."
  .ctx:     "All APIs MUST use REST with JSON. GraphQL allowed for internal."
  Last sync: 2026-03-10T10:00:00Z

  Resolution required: edit spec-kit, edit .ctx, or choose a side.
```

## Try It Out

### Step 1: Import the constitution

```bash
ctxkit speckit import --constitution specs/constitution.md
```

Expected output:

```
Importing constitution: specs/constitution.md
==============================================

Found 3 CONST- decisions:

  CONST-001: All APIs use REST
    -> contract: const-001-rest-api (locked, scope: ["src/api/*"])

  CONST-002: Authentication via JWT
    -> contract: const-002-jwt-auth (locked, scope: ["src/auth/*"])

  CONST-003: Input validation with Zod
    -> contract: const-003-zod-validation (locked, scope: ["src/**/*.ts"])

Created 3 contracts in .ctx
```

### Step 2: Import component specs

```bash
ctxkit speckit import --specs specs/auth.md
```

Expected output:

```
Importing component spec: specs/auth.md
========================================

Found 3 FR- requirements:

  FR-AUTH-001: Password hashing with bcrypt
    -> contract: fr-auth-001-bcrypt (locked, scope: ["src/auth/*"])

  FR-AUTH-002: Token expiry configuration
    -> contract: fr-auth-002-token-expiry (locked, scope: ["src/auth/jwt*"])

  FR-AUTH-003: Login rate limiting
    -> contract: fr-auth-003-rate-limit (locked, scope: ["src/auth/handler*"])

Created 3 contracts in src/auth/.ctx
```

### Step 3: Validate .ctx files against specs

```bash
ctxkit speckit validate
```

Expected output:

```
Validating .ctx files against spec-kit specifications
======================================================

.ctx:
  const-001-rest-api:       OK (matches CONST-001)
  const-002-jwt-auth:       OK (matches CONST-002)
  const-003-zod-validation: OK (matches CONST-003)

src/auth/.ctx:
  fr-auth-001-bcrypt:       OK (matches FR-AUTH-001)
  fr-auth-002-token-expiry: OK (matches FR-AUTH-002)
  fr-auth-003-rate-limit:   OK (matches FR-AUTH-003)

All 6 spec-kit contracts valid. 0 conflicts.
```

### Step 4: Sync bidirectionally

```bash
ctxkit speckit sync
```

Expected output (when in sync):

```
Syncing spec-kit <-> ctxl
==========================

Checking specs/constitution.md <-> .ctx ...
  3 contracts in sync. No changes.

Checking specs/auth.md <-> src/auth/.ctx ...
  3 contracts in sync. No changes.

Everything in sync.
```

### Step 5: Export .ctx contracts back to spec-kit

```bash
ctxkit speckit export
```

Expected output:

```
Exporting .ctx contracts to spec-kit
=====================================

.ctx -> specs/constitution.md:
  3 CONST- contracts exported (no changes needed)

src/auth/.ctx -> specs/auth.md:
  3 FR- contracts exported (no changes needed)

Export complete.
```

## Key Takeaways

- The spec-kit bridge connects spec-kit constitutional decisions (CONST-)
  and functional requirements (FR-) to ctxl contracts, creating a single
  source of truth for project invariants.
- Imported contracts are always locked, ensuring they cannot be modified
  by automated proposals without human review.
- Bidirectional sync detects drift in both directions and reports conflicts
  when both sides have changed independently.
- Use `ctxkit speckit validate` to verify that `.ctx` contracts still
  match their spec-kit sources.
- The bridge supports incremental import: running `ctxkit speckit import`
  again updates existing contracts and adds new ones without duplicating.
