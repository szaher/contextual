# Example 02: Key Files

## What This Demonstrates

The `key_files` section maps important source files to their purpose, with
metadata that controls how ctxl scores, locks, and tracks them. This is one
of the most frequently used sections in any `.ctx` file.

## Key Concepts

### The key_files Entry Structure

Each entry in `key_files` has the following fields:

| Field         | Required | Description                                              |
|---------------|----------|----------------------------------------------------------|
| `path`        | yes      | Relative path to the file from this .ctx's directory     |
| `why`         | yes      | Short explanation of why this file matters                |
| `tags`        | no       | Retrieval tags for scoring against request text           |
| `verified_at` | yes      | Commit hash when this entry was last verified accurate    |
| `locked`      | no       | If true, automated proposals will skip this entry         |
| `owner`       | no       | Ownership tag (e.g., "security") for review requirements  |

### Tags and Scoring

Tags directly influence which key_files entries appear in the Context Pack.
When a developer asks "fix the login bug", the system looks for tag matches
against each entry. An entry tagged `[auth, security]` will score higher
for auth-related requests than one tagged `[database, infrastructure]`.

Choose tags that reflect:
- The domain (auth, billing, notifications)
- The technical area (middleware, database, api)
- The function (entry, config, test)

### Locking Entries

Setting `locked: true` prevents ctxl from proposing automated changes to
that entry. This is useful for:
- Security-critical entries that should only change via human review
- Entries owned by a specific team (use the `owner` field)
- Stable references you do not want drift detection to modify

Locked entries still participate in scoring and injection -- they are just
protected from automated edits.

### Verification and Drift

The `verified_at` field records the commit hash when the entry was last
confirmed accurate. When ctxl runs drift detection, it checks whether the
referenced file has changed since that commit. If it has, the entry is
flagged as potentially stale.

Stale entries receive a lower recency score during context assembly,
making them less likely to be injected unless they match on other criteria.

## Commands to Try

### Preview context for an auth-related request

```bash
ctxkit inject --preview \
  --request "fix the authentication bug in the login flow" \
  --budget 4000
```

Expected output:

```
Context Pack (450 / 4,000 tokens)

Included (3 items):
  1. [TAG_MATCH]     .ctx -> key_files/src/auth.ts (120 tok)
  2. [LOCALITY_HIGH] .ctx -> key_files/src/index.ts (95 tok)
  3. [LOCALITY_HIGH] .ctx -> summary (110 tok)

Omitted (1 item):
  - .ctx -> key_files/src/database.ts (score: 0.25, reason: LOW_SCORE)
```

Notice that `src/auth.ts` ranks highest because its tags `[auth, security]`
match the request about authentication.

### Check for drift

```bash
ctxkit drift
```

If `src/database.ts` was modified after commit `c3d9f0a`, the output
would show:

```
STALE: key_files/src/database.ts
  Verified at: c3d9f0a (5 commits behind)
  File modified in: e7b1234, d8a5678
  Suggestion: re-verify or update the entry
```

### Validate references

```bash
ctxkit validate
```

If a referenced file does not exist, validation will warn:

```
WARNING: .ctx key_files entry references non-existent file: src/missing.ts
```

## Tips

- List only the files that matter most. A `.ctx` with 50 key_files entries
  is less useful than one with 5-10 well-chosen entries. Agents need
  orientation, not a complete file listing.
- The `why` field should answer "why would an agent care about this file?"
  not "what does this file contain?" Focus on purpose and relationships.
- Use `locked: true` sparingly. Over-locking defeats the purpose of
  automated drift detection and update proposals.
- Update `verified_at` whenever you manually review an entry. This keeps
  the recency score high and prevents false staleness warnings.
