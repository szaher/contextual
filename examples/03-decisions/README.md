# Example 03: Architectural Decisions

## What This Demonstrates

The `decisions` section stores lightweight architectural decision records
(ADRs) directly in `.ctx` files. Each decision captures what was decided,
why, when, what alternatives were considered, and why they were rejected.

This is one of the most valuable sections for AI agents. Without decisions,
agents may propose changes that violate past architectural choices or
re-introduce approaches that were already evaluated and rejected.

## Decision Entry Structure

| Field             | Required | Description                                          |
|-------------------|----------|------------------------------------------------------|
| `id`              | yes      | Unique identifier (e.g., d001, adr-001)              |
| `title`           | yes      | Short description of the decision                    |
| `status`          | yes      | One of: proposed, accepted, superseded, deprecated   |
| `date`            | yes      | When the decision was made (ISO 8601 date)           |
| `rationale`       | yes      | Why this choice was made                             |
| `alternatives`    | no       | List of alternatives with rejection reasons          |
| `verified_at`     | yes      | Commit hash when last verified                       |
| `locked`          | no       | Prevent automated edits                              |
| `owner`           | no       | Team or person responsible                           |

## Decision Statuses

- **proposed**: Under discussion, not yet finalized. Agents should note
  this is tentative and may change.
- **accepted**: Finalized and in effect. Agents should respect this
  decision and not propose alternatives without being asked.
- **superseded**: Replaced by a newer decision. Kept for historical
  context. The superseding decision should be referenced.
- **deprecated**: No longer relevant but retained for the historical
  record.

## Commands to Try

### Preview context for a database-related request

```bash
ctxkit inject --preview \
  --request "should we add a caching layer for product queries?" \
  --budget 4000
```

Expected output:

```
Context Pack (680 / 4,000 tokens)

Included (3 items):
  1. [TAG_MATCH]     .ctx -> decisions/d001 (185 tok)
  2. [TAG_MATCH]     .ctx -> decisions/d005 (160 tok)
  3. [LOCALITY_HIGH] .ctx -> summary (120 tok)

Omitted (3 items):
  - .ctx -> decisions/d002 (score: 0.30, reason: LOW_SCORE)
  - .ctx -> decisions/d003 (score: 0.28, reason: LOW_SCORE)
  - .ctx -> decisions/d004 (score: 0.15, reason: LOW_SCORE, SUPERSEDED)
```

The system correctly surfaces the database decision (d001) and the API
architecture decision (d005) because they are most relevant to a caching
discussion. The payment decision (d002) is omitted as irrelevant.

### Validate decisions

```bash
ctxkit validate
```

The validator checks:
- All decision IDs are unique within the file
- Required fields are present
- Dates are valid ISO 8601 format
- Superseded decisions reference a successor (warning if missing)

## Best Practices

- **Record the "why", not just the "what"**: The rationale is the most
  valuable part. "We use PostgreSQL" is useless. "We use PostgreSQL
  because we need ACID transactions for checkout" tells the agent why
  it should not propose switching to a document store.

- **Always list alternatives**: Even if only briefly. This prevents agents
  from suggesting approaches you have already considered and rejected.

- **Use locking for critical decisions**: Decisions owned by security,
  compliance, or infrastructure teams should be locked to prevent
  automated proposals from modifying them.

- **Keep superseded decisions**: Do not delete old decisions. They provide
  context for why the current approach exists. Mark them as `superseded`
  and reference the replacement.

- **Date your decisions**: Agents can use the date to understand whether
  a decision was made recently (high confidence) or years ago (might
  need re-evaluation).

- **Update verified_at**: When you review a decision and confirm it is
  still valid, update the `verified_at` commit hash. This resets the
  staleness clock.
