# Auto-Update During Sessions

ctxl tracks which directories are modified during an agent session and automatically generates `.ctx` update proposals when tasks complete. This keeps context memory fresh without requiring manual maintenance.

## Overview

The auto-update system has three components:

1. **StalenessTracker** -- monitors file modifications during a session
2. **PostToolUse hook** -- marks directories as stale when files are edited
3. **TaskCompleted hook** -- generates update proposals for stale directories

Together, these components ensure that `.ctx` files reflect the current state of the codebase after every agent task.

## StalenessTracker

The `StalenessTracker` maintains a set of directories that have been modified during the current session. It tracks:

- Which directories contain files that were edited, created, or deleted
- The timestamp of the most recent modification in each directory
- The list of specific files that changed

```typescript
import { StalenessTracker } from '@ctxkit/core'

const tracker = new StalenessTracker()

// Mark a directory as stale
tracker.markStale('/path/to/repo/src/auth', {
  file: 'login.ts',
  action: 'modified',
  timestamp: new Date().toISOString(),
})

// Check if a directory is stale
tracker.isStale('/path/to/repo/src/auth')  // true

// Get all stale directories
tracker.getStaleDirectories()
// [{ dir: '/path/to/repo/src/auth', files: ['login.ts'], lastModified: '...' }]

// Clear staleness (after proposals are generated)
tracker.clearAll()
```

## PostToolUse Hook

The `PostToolUse` hook in the Claude Code plugin intercepts tool results and extracts file paths from them. When a file is edited, created, or deleted, the hook:

1. Extracts the file path from the tool input or result
2. Resolves the containing directory
3. Calls `tracker.markStale()` for that directory

### Path Extraction

The `extractModifiedPath()` function handles different tool types:

| Tool | Path Source |
|------|------------|
| `file_edit`, `Write` | `tool_input.file_path` |
| `Bash` | Parsed from `git`, `mv`, `rm`, `cp` commands in the command string |
| `NotebookEdit` | `tool_input.notebook_path` |

```typescript
import { extractModifiedPath } from '@ctxkit/core'

const path = extractModifiedPath({
  tool_name: 'file_edit',
  tool_input: { file_path: '/path/to/repo/src/auth/login.ts' },
})
// '/path/to/repo/src/auth/login.ts'
```

## TaskCompleted Hook

When a task completes (the agent finishes responding to a prompt), the `TaskCompleted` hook:

1. Retrieves the list of stale directories from the tracker
2. For each stale directory that contains a `.ctx` file, generates an update proposal
3. Depending on policy, either applies the proposal automatically or queues it for review
4. Clears the staleness tracker

### Proposal Generation

The proposal generator analyzes the changes to produce targeted updates:

```
For each stale directory:
  1. Run `git diff` on the modified files
  2. Check if any modified files should be added to key_files
  3. Detect new tags from file content and dependencies
  4. Update the summary if significant changes occurred
  5. Generate a proposal with the computed diff
```

The generated proposals are conservative: they add new `key_files` entries for new files, update tags based on imports and dependencies, and flag potentially stale entries. They do not remove entries or modify contracts.

### Example Proposal

After an agent creates a new file `src/auth/mfa.ts`:

```diff
--- a/src/auth/.ctx
+++ b/src/auth/.ctx
@@ -8,6 +8,10 @@ key_files:
   - path: login.ts
     purpose: "Handles user authentication flow"
     tags: [auth, login]
+  - path: mfa.ts
+    purpose: "Multi-factor authentication handler"
+    tags: [auth, mfa, security]
+    verified_at: "2026-03-15"
 tags:
-  - auth
+  - auth
+  - mfa
```

## Policy

The auto-update policy controls what happens with generated proposals. Configure it in `.ctxl/config.yaml`:

```yaml
auto_update:
  enabled: true
  policy: require_review    # or "auto_apply"
  excluded_sections:
    - contracts             # never auto-update contracts
    - decisions             # never auto-update decisions
```

### Policy Options

| Policy | Behavior |
|--------|----------|
| `auto_apply` | Proposals are applied immediately without human review. A history entry is created with author `"auto-update"`. |
| `require_review` | Proposals are queued with status `"proposed"` and appear in the dashboard for human review. |

### Excluded Sections

Certain sections can be excluded from auto-update to prevent unintended changes:

- **contracts** -- safety invariants should not be modified by automated processes
- **decisions** -- architectural decisions require human judgment

Excluded sections are never modified by auto-generated proposals, even in `auto_apply` mode.

## Configuration

Full configuration options:

```yaml
auto_update:
  enabled: true                    # Enable/disable auto-update (default: true)
  policy: require_review           # "auto_apply" or "require_review" (default: require_review)
  excluded_sections:               # Sections to skip (default: [contracts, decisions])
    - contracts
    - decisions
  min_changes: 1                   # Minimum file changes to trigger (default: 1)
  debounce_ms: 5000               # Debounce interval in ms (default: 5000)
```

### Debouncing

The `debounce_ms` setting prevents excessive proposal generation during rapid file edits. The TaskCompleted hook waits for the debounce interval after the last modification before generating proposals.

## How It Fits Together

```
Agent receives prompt
  |
  v
Agent edits src/auth/login.ts
  |
  v
PostToolUse hook fires
  -> extractModifiedPath() -> "src/auth/login.ts"
  -> tracker.markStale("src/auth/")
  |
  v
Agent edits src/auth/mfa.ts (new file)
  |
  v
PostToolUse hook fires
  -> tracker.markStale("src/auth/")
  |
  v
Agent completes task
  |
  v
TaskCompleted hook fires
  -> tracker.getStaleDirectories() -> ["src/auth/"]
  -> generateUpdateProposals("src/auth/")
  -> policy = "require_review"
  -> submit proposal to daemon
  -> tracker.clearAll()
```

## Next Steps

- Understand the [Claude Code plugin hooks](/guide/agent-integration) that drive auto-update
- Learn about [Proposals](/guide/proposals) and the review workflow
- See the [Dashboard](/guide/dashboard) for reviewing auto-generated proposals
- Read about [Version Tracking](/guide/versioning) and how auto-updates are versioned
