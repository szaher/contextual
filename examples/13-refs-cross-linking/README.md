# Example 13: Cross-References (Refs)

## What This Demonstrates

How to link between `.ctx` files using the `refs` section to avoid
duplicating information across directories. When one directory depends
on shared context from another, a ref brings in the relevant sections
without copying them.

## The Problem Refs Solve

Consider a monorepo with a shared library:

```
project/
  .ctx                 # API server context
  lib/
    .ctx               # Shared library context with important contracts
```

The API server uses the shared library. The library's contracts (validation
rules, error handling) apply when working on API code too. Without refs,
you would need to duplicate the contracts in the root `.ctx` -- and then
keep both copies in sync.

With refs, the root `.ctx` simply links to `lib/.ctx`:

```yaml
refs:
  - target: "lib/.ctx"
    sections: [contracts, decisions]
    reason: "Shared library constraints apply to code that uses lib/"
```

## Ref Entry Structure

| Field       | Required | Description                                         |
|-------------|----------|-----------------------------------------------------|
| `target`    | yes      | Relative path to the referenced .ctx file            |
| `sections`  | yes      | Which sections to pull in (contracts, decisions, etc.)|
| `reason`    | yes      | Why this reference exists                            |

### Section Selection

You control which sections are pulled in. Common patterns:

```yaml
# Pull in everything
refs:
  - target: "../shared/.ctx"
    sections: [contracts, decisions, key_files, gotchas]
    reason: "All shared context applies"

# Pull in only contracts (most common)
refs:
  - target: "../shared/.ctx"
    sections: [contracts]
    reason: "Shared validation rules apply here"

# Pull in decisions and gotchas
refs:
  - target: "../security/.ctx"
    sections: [decisions, gotchas]
    reason: "Security decisions affect this module"
```

## How Refs Are Resolved

During context assembly, ctxl:

1. Loads the current directory's `.ctx` file
2. Walks up to parent directories (hierarchical loading)
3. At each level, follows `refs` links
4. Referenced entries are loaded with slightly lower priority than
   direct entries (they are "borrowed" context, not local context)
5. Circular references are detected and broken with a warning

### Resolution Order

For directory `src/api/`:

```
1. src/api/.ctx           (highest priority, local)
2. src/api/.ctx -> refs   (referenced context)
3. src/.ctx               (parent)
4. src/.ctx -> refs       (parent's references)
5. .ctx                   (root, lowest priority)
6. .ctx -> refs           (root's references)
```

### Circular Reference Protection

If `.ctx` references `lib/.ctx` and `lib/.ctx` references `.ctx`, ctxl
detects the cycle and breaks it:

```
WARNING: Circular .ctx reference detected:
  .ctx -> lib/.ctx -> .ctx
  Breaking cycle at: .ctx (already loaded)
```

Each `.ctx` file is loaded at most once, even if referenced multiple times.

## Commands to Try

### Preview context with refs resolved

```bash
ctxkit inject --preview \
  --request "update the User validation schema" \
  --budget 4000
```

Expected output:

```
Context Pack (1,100 / 4,000 tokens)

Included (4 items):
  1. [CONTRACT_REQUIRED] lib/.ctx -> contracts/validation-schema-rules (180 tok)
     (via ref from .ctx)
  2. [TAG_MATCH]         lib/.ctx -> key_files/validators.ts (60 tok)
     (via ref from .ctx)
  3. [TAG_MATCH]         lib/.ctx -> decisions/d-lib-001 (140 tok)
     (via ref from .ctx)
  4. [LOCALITY_HIGH]     .ctx -> summary (120 tok)

Omitted (2 items):
  - lib/.ctx -> contracts/error-handling-contract (reason: SCOPE_MISMATCH)
  - .ctx -> key_files/src/server.ts (score: 0.20, reason: LOW_SCORE)
```

Notice:
- The validation contract from `lib/.ctx` is included via the ref
- The error handling contract is NOT included (its scope does not match)
- Each included item shows "(via ref from .ctx)" to indicate it was
  pulled in through a reference

### Check which refs are active

```bash
ctxkit validate --verbose
```

Output includes:

```
Refs resolved:
  .ctx -> lib/.ctx (sections: contracts, decisions)
    - 2 contracts loaded
    - 1 decision loaded
```

## Common Patterns

### Shared Library

```yaml
# In the consumer's .ctx
refs:
  - target: "../lib/.ctx"
    sections: [contracts]
    reason: "Shared validation and error handling rules"
```

### Security Module

```yaml
# In any module that handles sensitive data
refs:
  - target: "../security/.ctx"
    sections: [contracts, decisions]
    reason: "Security contracts and policies apply here"
```

### Cross-Service Contracts

```yaml
# In service-a/.ctx
refs:
  - target: "../service-b/.ctx"
    sections: [contracts]
    reason: "Service B's API contract -- we are a consumer"
```

### Multiple Refs

```yaml
refs:
  - target: "../lib/.ctx"
    sections: [contracts]
    reason: "Shared library rules"
  - target: "../security/.ctx"
    sections: [contracts, decisions]
    reason: "Security policies"
  - target: "../api-gateway/.ctx"
    sections: [contracts]
    reason: "API gateway routing rules affect our endpoints"
```

## Best Practices

- **Use refs for shared contracts**: This is the primary use case.
  Contracts that apply to multiple consumers should be defined once
  and referenced everywhere.

- **Be specific about sections**: Pull in only the sections you need.
  Pulling in everything (`sections: [contracts, decisions, key_files, gotchas]`)
  adds noise and consumes token budget.

- **Always include a reason**: The reason field helps future developers
  understand why the reference exists. Without it, refs become
  mysterious dependencies.

- **Keep reference paths relative**: Use relative paths (`../lib/.ctx`)
  so refs work regardless of where the repo is cloned.

- **Test with ctxkit inject --preview**: After adding a ref, verify
  that the expected entries are included in the Context Pack. Refs that
  do not contribute useful context should be removed.

- **Avoid deep ref chains**: A -> B -> C -> D becomes hard to reason
  about. Keep the reference graph shallow (max 2-3 levels).
