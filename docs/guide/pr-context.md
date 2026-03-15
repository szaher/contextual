# PR Context Generation

ctxl collects session data during agent interactions and can render it into structured pull request descriptions. This gives reviewers full visibility into what the agent was asked to do, what decisions it made, which context it used, and what changed.

## What PR Context Includes

A PR context report assembles data from the session timeline:

| Section | Source | Description |
|---------|--------|-------------|
| Summary | Session events | One-paragraph summary of all changes |
| Prompt Chain | Request events | The sequence of prompts given to the agent |
| Decisions | Proposals + events | Key decisions the agent made during the session |
| File Changes | Tool events | Files created, modified, or deleted |
| Context Used | Context pack events | Which `.ctx` entries were injected and why |
| Stats | Aggregated | Token usage, request count, session duration |

## CLI Usage

### Basic Usage

```bash
# Generate PR context for the current branch
ctxkit pr --branch feature/auth-refactor

# Output
## Summary

Refactored the authentication module to support MFA. Added TOTP verification,
updated the login handler, and modified the auth contract to include MFA
requirements.

## Prompt Chain

1. "Add multi-factor authentication support to the login flow"
2. "Create the TOTP verification handler"
3. "Update the auth contract to include MFA requirements"

## Decisions

- Used `otplib` for TOTP generation (lightweight, no native dependencies)
- Stored MFA secrets in the existing user table rather than a separate table
- Added rate limiting to the verification endpoint (5 attempts per minute)

## File Changes

| File | Action | Lines |
|------|--------|-------|
| src/auth/mfa.ts | created | +142 |
| src/auth/login.ts | modified | +28, -12 |
| src/auth/.ctx | modified | +8, -2 |
| src/auth/mfa.test.ts | created | +86 |

## Context Used

| Source | Section | Entry | Score | Reason |
|--------|---------|-------|-------|--------|
| src/auth/.ctx | contracts | auth-security | 0.95 | CONTRACT_REQUIRED |
| src/auth/.ctx | key_files | login.ts | 0.88 | LOCALITY_HIGH, TAG_MATCH |
| .ctx | contracts | security-policy | 0.90 | CONTRACT_REQUIRED |

## Stats

- Session: sess_abc123
- Duration: 12 minutes
- Requests: 3
- Tokens used: 8,420 / 12,000
- Files changed: 4
- .ctx files updated: 1
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--branch <name>` | Current branch | Branch to generate context for |
| `--session <id>` | (auto-detected) | Specific session ID to use |
| `--format <fmt>` | `md` | Output format: `md`, `json`, or `gh` |
| `--gh` | `false` | Shorthand for `--format gh` (GitHub PR body format) |

### Output Formats

**Markdown** (`--format md`):

Standard markdown output suitable for pasting into any PR description or documentation.

**JSON** (`--format json`):

Structured JSON for programmatic consumption:

```json
{
  "summary": "Refactored the authentication module to support MFA.",
  "prompt_chain": [
    {
      "index": 1,
      "text": "Add multi-factor authentication support to the login flow",
      "timestamp": "2026-03-15T10:00:00.000Z"
    }
  ],
  "decisions": [
    {
      "description": "Used otplib for TOTP generation",
      "rationale": "lightweight, no native dependencies"
    }
  ],
  "file_changes": [
    {
      "path": "src/auth/mfa.ts",
      "action": "created",
      "lines_added": 142,
      "lines_removed": 0
    }
  ],
  "context_used": [
    {
      "source": "src/auth/.ctx",
      "section": "contracts",
      "entry_id": "auth-security",
      "score": 0.95,
      "reason_codes": ["CONTRACT_REQUIRED"]
    }
  ],
  "stats": {
    "session_id": "sess_abc123",
    "duration_seconds": 720,
    "request_count": 3,
    "tokens_used": 8420,
    "tokens_budget": 12000,
    "files_changed": 4,
    "ctx_files_updated": 1
  }
}
```

**GitHub body** (`--format gh` or `--gh`):

Formatted specifically for `gh pr create --body`. Includes collapsible sections for long content:

```bash
# Create a PR with ctxl context
ctxkit pr --gh | gh pr create --title "Add MFA support" --body-file -

# Or inline
gh pr create --title "Add MFA support" --body "$(ctxkit pr --gh)"
```

The GitHub format uses `<details>` tags for the prompt chain, decisions, and context sections to keep the PR description scannable while preserving full detail.

## Session Detection

When `--session` is not specified, ctxl auto-detects the session to use:

1. Checks for an active session in the daemon for the current repository and branch
2. If no active session, finds the most recent completed session for the branch
3. If no session is found, falls back to git log analysis (limited: no prompt chain or context data)

## Collecting Data Programmatically

```typescript
import { collectPrContext, renderPrMarkdown, renderPrJson, renderGhBody } from '@ctxkit/core'

// Collect session data into a structured object
const context = await collectPrContext({
  daemonUrl: 'http://localhost:3742',
  branch: 'feature/auth-refactor',
  sessionId: 'sess_abc123',   // optional
})

// Render in different formats
const markdown = renderPrMarkdown(context)
const json = renderPrJson(context)
const ghBody = renderGhBody(context)
```

## Integration with CI

PR context can be generated in CI pipelines:

```yaml
# GitHub Actions example
- name: Generate PR context
  run: |
    ctxkit daemon start
    ctxkit pr --branch ${{ github.head_ref }} --gh > pr-context.md

- name: Update PR description
  run: |
    gh pr edit ${{ github.event.pull_request.number }} \
      --body "$(cat pr-context.md)"
```

## Next Steps

- Learn about [Sessions](/guide/sessions) and what data they track
- Understand [Agent Integration](/guide/agent-integration) for how data is collected
- See the [CLI Reference](/api/cli-reference) for all `ctxkit pr` options
