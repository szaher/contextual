# API Contract Changes: Gap Remediation

**Branch**: `003-gap-remediation` | **Date**: 2026-03-04

---

## Daemon HTTP API Changes

### All POST/PATCH endpoints — Body Size Limit (NEW)

**Before**: No body size limit
**After**: 10MB maximum request body on all endpoints

```
Request body > 10MB → 413 Payload Too Large
{
  "error": "Request body too large",
  "max_bytes": 10485760
}
```

### GET /api/v1/drift — Path Validation (CHANGED)

**Before**: `ctx_path` parameter resolved without bounds checking
**After**: Resolved path validated to be within `repo_root`

```
GET /api/v1/drift?repo_root=/repo&ctx_path=../../etc/passwd
→ 400 Bad Request
{
  "error": "ctx_path resolves outside repository root"
}
```

### POST /api/v1/proposals/:id/apply — Full Implementation (CHANGED)

**Before**: Stub — only creates audit entry, does not modify .ctx file
**After**: Writes proposed content to .ctx file on disk

**Success response** (unchanged shape):
```
POST /api/v1/proposals/:id/apply
→ 200 OK
{
  "id": "<proposal-id>",
  "status": "applied",
  "audit_id": "<audit-entry-id>"
}
```

**New error — Conflict** (new):
```
POST /api/v1/proposals/:id/apply
→ 409 Conflict
{
  "error": "File has been modified since proposal was created",
  "ctx_path": "<path>",
  "expected_hash": "<hash-at-creation>",
  "actual_hash": "<current-hash>"
}
```

**New error — File not found** (new):
```
POST /api/v1/proposals/:id/apply
→ 404 Not Found
{
  "error": "Target .ctx file not found",
  "ctx_path": "<path>"
}
```

### POST /api/v1/proposals — Schema Addition (CHANGED)

**Before**: `diff_content` stored as-is
**After**: `source_hash` computed and stored alongside proposal

Request body unchanged. Response gains optional `source_hash` field:
```
{
  "id": "<id>",
  "status": "proposed",
  "source_hash": "<sha256-of-current-file>"
}
```

---

## CLI Changes

### `ctxkit inject --budget <value>` — Input Validation (CHANGED)

**Before**: Non-numeric values silently pass as `NaN`
**After**: Validates budget is a positive integer

```
$ ctxkit inject --request "test" --budget abc
Error: Invalid budget: must be a positive number

$ ctxkit inject --request "test" --budget -5
Error: Invalid budget: must be a positive number

$ ctxkit inject --request "test" --budget 0
Error: Invalid budget: must be a positive number
```

Exit code: 1

### `ctxkit run --budget <value>` — Input Validation (CHANGED)

Same validation behavior as `inject`.

---

## Core Library Changes

### `parseCtxFile()` — Return Type (CHANGED)

**Before**: Returns `CtxFile`
**After**: Returns `{ ctx: CtxFile, warnings: string[] }`

Warning format: `"Skipped <section>.<field>: expected <type>, got <actual-type>"`

### `buildContextPack()` — Return Type (EXTENDED)

**Before**: `ContextPack` without `warnings`
**After**: `ContextPack` with `warnings: string[]`

Warning format: `"Budget stretch: contract \"<id>\" requires <n> tokens, budget remaining: <n>"`

### `scoreRecency()` — Signature (CHANGED)

**Before**: `scoreRecency(verifiedAt: string, isStale: boolean): number`
**After**: `scoreRecency(verifiedAt: string, repoRoot?: string): number`

Returns continuous value in range [0.3, 1.0] based on time-decay.

### `scoreLocality()` — Behavior (CHANGED)

**Before**: Ancestor and sibling .ctx files at same depth score identically
**After**: Ancestor .ctx files score higher than siblings at same depth

No signature change.
