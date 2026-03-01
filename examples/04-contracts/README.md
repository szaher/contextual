# Example 04: Contracts and Guardrails

## What This Demonstrates

Context contracts are must-include invariants. Unlike regular `.ctx` entries
that are scored and may be omitted due to budget, contracts are injected
with high priority whenever a request touches their associated paths or tags.

Contracts solve a critical problem: agents that violate constraints they
were never told about. A contract ensures that when an agent works on auth
code, it always knows the security requirements.

## How Contracts Work

### Scope Matching

Each contract has a `scope` with two matching criteria:

```yaml
scope:
  paths: ["src/auth/*"]     # Glob patterns against touched files
  tags: [security, auth]    # Matched against request tags
```

A contract is triggered when:
- The request touches a file matching any of the `paths` patterns, OR
- The request matches any of the `tags`

When triggered, the contract is included in the Context Pack with the
reason code `CONTRACT_REQUIRED`.

### Contract Priority

Contracts receive a boosted score of at least 0.95, which places them
above almost all other entries. During budget allocation:

1. Contracts matching the request scope are included first
2. Remaining budget is filled with regular scored entries
3. If contracts alone exceed the budget, all contracts are still included
   and a warning is emitted

This means contracts are never silently dropped due to budget pressure.

## Contract Entry Structure

| Field         | Required | Description                                           |
|---------------|----------|-------------------------------------------------------|
| `name`        | yes      | Unique identifier for the contract                    |
| `scope.paths` | yes      | Glob patterns for file path matching (can be empty)   |
| `scope.tags`  | yes      | Tags for request matching (can be empty)              |
| `content`     | yes      | The contract text injected into the Context Pack      |
| `verified_at` | yes      | Commit hash when last verified                        |
| `locked`      | no       | Prevent automated edits (recommended: true)           |
| `owner`       | no       | Team responsible for this contract                    |

## Commands to Try

### Preview context for a request touching auth code

```bash
ctxkit inject --preview \
  --request "refactor the login handler to support OAuth" \
  --touched-files src/auth/handler.ts \
  --budget 4000
```

Expected output:

```
Context Pack (890 / 4,000 tokens)

Included (4 items):
  1. [CONTRACT_REQUIRED] .ctx -> contracts/auth-security-requirements (280 tok)
  2. [CONTRACT_REQUIRED] .ctx -> contracts/session-management-rules (150 tok)
  3. [TAG_MATCH]         .ctx -> key_files/src/auth/handler.ts (65 tok)
  4. [LOCALITY_HIGH]     .ctx -> summary (120 tok)

Omitted (1 item):
  - .ctx -> contracts/api-versioning-policy (score: 0.30, reason: SCOPE_MISMATCH)
```

Notice:
- Both auth-related contracts are included with `CONTRACT_REQUIRED`
- The API versioning contract is NOT included because its scope does not
  match the touched files or request tags
- Contracts appear first, before regular entries

### Test with a request that does not trigger contracts

```bash
ctxkit inject --preview \
  --request "update the README with setup instructions" \
  --budget 4000
```

Expected output:

```
Context Pack (240 / 4,000 tokens)

Included (2 items):
  1. [LOCALITY_HIGH] .ctx -> summary (120 tok)
  2. [LOCALITY_HIGH] .ctx -> commands (85 tok)

Omitted (4 items):
  - .ctx -> contracts/auth-security-requirements (reason: SCOPE_MISMATCH)
  - .ctx -> contracts/session-management-rules (reason: SCOPE_MISMATCH)
  - .ctx -> contracts/api-versioning-policy (reason: SCOPE_MISMATCH)
  - .ctx -> key_files/src/auth/handler.ts (score: 0.20, reason: LOW_SCORE)
```

No contracts are triggered because the request does not touch auth paths
or match security/auth tags.

## Best Practices

- **Keep contracts concise**: A contract with 50 rules is hard to follow.
  Break large contracts into smaller, scoped ones.

- **Lock your contracts**: Contracts define safety invariants. Use
  `locked: true` and an `owner` to prevent automated modifications.

- **Use path scope for precision**: Tag-only scoping can be too broad.
  Path patterns like `src/auth/*` ensure the contract fires only when
  the relevant code area is touched.

- **Write contracts as instructions**: The `content` field is injected
  directly into the agent prompt. Write it as clear, numbered rules
  that an AI can follow. Avoid vague guidelines like "be careful with
  security" -- instead, state exactly what must or must not be done.

- **Do not duplicate contracts**: If the same contract applies to
  multiple directories, define it once and use `refs` to link from
  other `.ctx` files. See Example 13 for cross-referencing.

- **Test your contracts**: Use `ctxkit inject --preview` with different
  requests to verify that contracts trigger (and do not trigger) as
  expected.
