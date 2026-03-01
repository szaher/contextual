# Drift Detection

Drift occurs when `.ctx` entries no longer match the actual state of the codebase. ctxl detects drift by cross-referencing `.ctx` content with git history and the filesystem, surfacing stale entries with actionable details.

## How Drift Detection Works

The drift detector examines each `.ctx` file and checks:

1. **Key files** -- do referenced files still exist? Have they been modified since `verified_at`?
2. **Contracts** -- is the `verified_at` commit still valid in git history?
3. **Decisions** -- is the `verified_at` commit still valid in git history?

For each entry, the detector compares the `verified_at` value against the current repository state.

## Drift Reasons

| Reason | Description | How Detected |
|--------|-------------|-------------|
| `file_deleted` | A referenced file no longer exists on disk | `existsSync()` returns false, and no rename detected |
| `file_renamed` | A referenced file was moved to a new path | `git log --follow --diff-filter=R` finds a rename |
| `file_modified` | A referenced file has commits since its `verified_at` hash | `git log verifiedAt..HEAD -- path` returns results |
| `commit_unknown` | The `verified_at` commit hash does not exist in git history | `git cat-file -t hash` fails |

## Running Drift Detection

### Single .ctx File

```bash
ctxkit drift path/to/.ctx
```

Output for a file with drift:

```
src/auth/.ctx -- 2 stale entry/entries:
  key_files/login.ts
    Reason: file_renamed
    Details: renamed to src/auth/sign-in.ts
    Verified at: abc1234
  contracts/auth-api
    Reason: commit_unknown
    Details: Cannot verify commit xyz9999 for auth-api
```

### All .ctx Files in Repository

```bash
ctxkit drift
```

This scans the entire repository for `.ctx` files (excluding `node_modules/` and `.git/`), checks each one, and reports results:

```
All 5 .ctx file(s) are up to date.
```

Or if drift is detected:

```
src/auth/.ctx -- 2 stale entry/entries:
  key_files/login.ts
    Reason: file_deleted
    Details: File src/auth/login.ts no longer exists
    Verified at: abc1234

Total: 2 stale entry/entries across 5 .ctx file(s)
```

The command exits with code 1 if any drift is detected, making it suitable for CI checks.

### Via HTTP API

```bash
# All .ctx files in a repo
curl "http://localhost:3742/api/v1/drift?repo_root=/path/to/repo"

# Specific .ctx file
curl "http://localhost:3742/api/v1/drift?repo_root=/path/to/repo&ctx_path=src/auth/.ctx"
```

## Detection Details

### File Deletion

When a key file's path does not exist on disk, the detector first checks for a rename:

```typescript
const renamed = detectRename(relPath, verifiedAt, repoRoot);
if (renamed) {
  return { reason: 'file_renamed', details: `renamed to ${renamed}` };
}
return { reason: 'file_deleted', details: `File ${relPath} no longer exists` };
```

Rename detection uses `git log --follow --diff-filter=R` to check if git recorded a rename from the old path.

### File Modification

For files that still exist, the detector checks if any commits have touched the file since the `verified_at` commit:

```bash
git log --oneline abc1234..HEAD -- "src/auth/login.ts"
```

If this returns any output, the file has been modified since last verification.

### Commit Validation

For contracts and decisions, the detector verifies that the `verified_at` commit hash exists:

```bash
git cat-file -t abc1234
```

If this fails, the commit is unknown (possibly due to a rebase, squash, or branch deletion).

## Impact on Scoring

Stale entries receive lower recency scores, which reduces their ranking in the Context Pack:

| Verified Status | Recency Score |
|----------------|---------------|
| Marked stale | 0.3 |
| No `verified_at` value | 0.5 |
| Verified and not stale | 0.9 |

A stale key file with locality 1.0 and tag match 0.5 would score:

```
1.0 * 0.4 + 0.5 * 0.3 + 0.3 * 0.2 = 0.61
```

Compared to a verified version:

```
1.0 * 0.4 + 0.5 * 0.3 + 0.9 * 0.2 = 0.73
```

This ensures that stale entries are naturally deprioritized but not completely excluded, since the information might still be partially correct.

## Locked Entries and Drift

When drift is detected on a locked entry, ctxl behaves differently:

- **Drift is still reported** -- the entry appears in drift scan results
- **No automated proposal** -- proposals skip locked entries
- **Warning surfaced** -- the dashboard shows a stale badge on locked entries
- **Developer decides** -- the owner must manually update or verify the entry

This respects the lock semantics: if someone locked an entry, it is important enough that automated changes should not touch it.

## Integrating with CI

Add drift detection to your CI pipeline to catch stale context early:

```yaml
# GitHub Actions example
- name: Check for .ctx drift
  run: ctxkit drift
  # Exits with code 1 if drift detected
```

## Fixing Drift

After drift is detected, you have several options:

1. **Manual update** -- edit the `.ctx` file directly to fix the reference and update `verified_at`

2. **Use proposals** -- run `ctxkit propose path/.ctx --check-files` to generate a proposal, then `ctxkit apply <proposal-id>` to apply it

3. **Re-initialize** -- for heavily drifted files, re-run `ctxkit init --force --dir path/` and manually merge the results

4. **Update verification** -- if the content is still correct despite file changes, just update the `verified_at` field to the current commit hash

## API Reference

```typescript
function detectDrift(ctxPath: string, repoRoot: string): DriftResult
function detectAllDrift(repoRoot: string): DriftResult[]

interface DriftResult {
  ctx_path: string;          // Relative path to the .ctx file
  stale_entries: StaleEntry[];
  total_stale: number;
}

interface StaleEntry {
  section: string;           // key_files, contracts, decisions
  entry_id: string;          // The entry identifier
  verified_at: string;       // The stored verification value
  current_commit: string;    // Current HEAD commit (short hash)
  reason: 'file_deleted' | 'file_renamed' | 'file_modified' | 'commit_unknown';
  details: string;           // Human-readable explanation
}
```

## Next Steps

- Learn about the [Proposal](/guide/proposals) workflow for applying fixes
- Understand how drift affects [Scoring](/guide/scoring-algorithm)
- Set up [Security](/guide/security) to prevent secrets in `.ctx` updates
