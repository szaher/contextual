# Profiles

Profiles configure ctxl's behavior at multiple levels. The configuration system uses a layered approach where more specific settings override broader ones, allowing per-repo and per-agent customization while maintaining sensible defaults.

## Precedence Chain

Settings are resolved with the following priority (highest wins):

```
1. Request overrides (--budget flag, API parameters)
2. Agent-specific config (agents.<id> in workspace profile)
3. Workspace profile (.ctxl/config.yaml in repo)
4. Global profile (~/.ctxl/config.yaml)
5. System defaults
```

## System Defaults

When no configuration exists, ctxl uses these defaults:

| Setting | Default Value |
|---------|--------------|
| `budget.default_tokens` | 4,000 |
| `scoring.mode` | `lexical` |
| `ignore.never_read` | `[]` |
| `ignore.never_log` | `[]` |
| `auto_approve.sections` | `[]` |
| `auto_approve.excluded_owners` | `[]` |
| `retention.sessions_days` | 30 |
| `retention.audit_days` | 90 |

## Global Profile

Location: `~/.ctxl/config.yaml`

The global profile applies to all repositories on this machine. It is useful for personal preferences like default budgets and machine-wide ignore rules.

```yaml
# ~/.ctxl/config.yaml
version: 1
global_ctx: "~/.ctxl/global.ctx"   # Optional: global .ctx file for personal conventions
budget:
  default_tokens: 6000
ignore:
  never_read:
    - ".env"
    - ".env.local"
    - "*.pem"
    - ".ssh/*"
  never_log:
    - ".env"
    - "credentials.json"
```

### Global .ctx

The `global_ctx` field points to a personal `.ctx` file with conventions that apply everywhere:

```yaml
# ~/.ctxl/global.ctx
version: 1
summary: "Personal coding conventions"
commands:
  format: "prettier --write ."
gotchas:
  - text: "Always use UTC timestamps"
    tags: [timestamps]
    verified_at: "2026-01-01"
    locked: false
tags: []
key_files: []
contracts: []
decisions: []
refs: []
ignore:
  never_read: []
  never_log: []
```

## Workspace Profile

Location: `.ctxl/config.yaml` (in the repository root)

The workspace profile configures ctxl for a specific project. It is committed to git and shared with the team.

```yaml
# .ctxl/config.yaml
version: 1
budget:
  default_tokens: 8000
scoring:
  mode: lexical          # or "hybrid" for embedding-based scoring
ignore:
  never_read:
    - ".env"
    - ".env.*"
    - "secrets/**"
    - "test/fixtures/credentials*"
  never_log:
    - ".env"
    - "*.key"
agents:
  claude:
    budget_tokens: 12000
    mode: lexical
  copilot:
    budget_tokens: 4000
    mode: lexical
  cursor:
    budget_tokens: 6000
    mode: lexical
auto_approve:
  sections:
    - key_files
    - gotchas
  excluded_owners:
    - security-team
    - compliance
retention:
  sessions_days: 14
  audit_days: 60
```

### Budget Configuration

```yaml
budget:
  default_tokens: 8000   # Default token budget for all context packs
```

This overrides the system default of 4,000 tokens. Agents with their own `budget_tokens` config will use their specific value instead.

### Scoring Mode

```yaml
scoring:
  mode: lexical    # Text-based scoring (default, MVP)
  # mode: hybrid   # Lexical + embedding-based scoring (v1)
```

The `lexical` mode uses the heuristic scoring algorithm (locality, tags, recency). The `hybrid` mode adds optional embedding-based semantic scoring (pluggable, requires a provider).

### Agent-Specific Configuration

Define per-agent settings in the `agents` section:

```yaml
agents:
  claude:
    budget_tokens: 12000    # Claude can handle larger context
    mode: lexical
  copilot:
    budget_tokens: 4000     # Copilot works best with compact context
    mode: lexical
```

When `ctxkit run --agent claude` is used, the agent-specific config is loaded and overrides the workspace defaults.

### Auto-Approve Rules

Configure which proposal sections can be auto-approved (without manual review):

```yaml
auto_approve:
  sections:
    - key_files           # Auto-approve key_files updates
    - gotchas             # Auto-approve gotcha updates
  excluded_owners:
    - security-team       # Never auto-approve entries owned by security-team
    - compliance          # Never auto-approve entries owned by compliance
```

This allows routine updates (like file path changes in key_files) to be applied quickly while ensuring sensitive entries always get human review.

### Retention

Control how long session and audit data is kept:

```yaml
retention:
  sessions_days: 14       # Delete sessions older than 14 days
  audit_days: 60          # Delete audit entries older than 60 days
```

Lower values save disk space; higher values preserve history for debugging.

### Ignore Policies

Ignore rules from workspace profiles are **merged** with global rules. They use deny-list semantics -- rules can only be added, never removed:

```yaml
ignore:
  never_read:
    - ".env"
    - "secrets/**"
  never_log:
    - ".env"
    - "*.key"
```

`never_read` paths are excluded from context assembly entirely. `never_log` paths are excluded from event recording and audit logs.

Patterns support:
- Exact paths: `.env`
- Trailing wildcards: `secrets/*` (one level), `secrets/**` (recursive)
- File globs: `*.pem`, `*.key`

## Loading Profiles

The profile is loaded via the core library:

```typescript
import { loadProfile } from '@ctxl/core'

const profile = loadProfile('/path/to/repo', {
  budgetTokens: 8000,        // Optional: per-request override
  scoringMode: 'lexical',    // Optional: per-request override
  agentId: 'claude',         // Optional: load agent-specific config
})

console.log(profile.budget.default_tokens)  // 8000
console.log(profile.scoring.mode)           // "lexical"
console.log(profile.sources)                // ["defaults", "~/.ctxl/config.yaml", ".ctxl/config.yaml", "agent:claude"]
```

The `sources` field shows which configuration files contributed to the final profile, useful for debugging.

## Merge Behavior

When multiple profile layers define the same setting:

| Setting | Merge Strategy |
|---------|---------------|
| `budget.default_tokens` | Last value wins (most specific layer) |
| `scoring.mode` | Last value wins |
| `ignore.never_read` | Union (deny-list grows) |
| `ignore.never_log` | Union (deny-list grows) |
| `auto_approve.sections` | Last value wins |
| `auto_approve.excluded_owners` | Last value wins |
| `retention.sessions_days` | Last value wins |
| `retention.audit_days` | Last value wins |

Note that ignore policies always grow: if the global profile says "never read `.env`", the workspace profile cannot undo that. This is a safety design choice.

## Next Steps

- Learn about [Security](/guide/security) and secret handling
- Set up [Agent Integration](/guide/agent-integration) with per-agent profiles
- Explore the [Dashboard](/guide/dashboard) for visual management
