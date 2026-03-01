# Example 08: Workspace Profiles

## What This Demonstrates

How to configure ctxl at the repository level using `.ctxl/config.yaml`.
Profiles control token budgets, scoring modes, ignore policies, per-agent
settings, auto-approve rules, and data retention -- all without modifying
`.ctx` files.

## Profile Location

```
project-root/
  .ctxl/
    config.yaml       # Repository-level profile (git-trackable)
  .ctx                # Project context (separate from config)
```

The profile lives in `.ctxl/config.yaml` at the repository root. It is
separate from `.ctx` files, which contain project knowledge. The profile
is about how ctxl behaves, not what it knows.

## Profile Sections

### Budget

```yaml
budget:
  default_tokens: 4000
```

Sets the default token budget for Context Pack assembly. This is the
ceiling for how much context is injected into agent prompts. The default
is 4,000 tokens if not configured.

### Scoring

```yaml
scoring:
  mode: lexical
```

Controls the retrieval mode:
- `lexical`: Text-based scoring using locality, recency, tags, and pins.
  This is the MVP mode and works well for most projects.
- `hybrid`: Adds embedding-based semantic scoring. Requires a v1 setup
  with a local or remote embedding provider.

### Ignore Policies

```yaml
ignore:
  never_read: [".env", "secrets/", "node_modules/"]
  never_log: [".env", "secrets/"]
```

Repository-wide ignore policies that merge with per-directory `.ctx`
ignore sections. Deny-list semantics: these patterns cannot be overridden
by child `.ctx` files.

### Per-Agent Configuration

```yaml
agents:
  claude:
    budget_tokens: 8000
    mode: lexical
  copilot:
    budget_tokens: 2000
```

Different agents can have different budgets. When a session is started
with `agent_id: "claude"`, it uses 8,000 tokens. When `agent_id: "copilot"`
is used, it gets 2,000 tokens.

This is useful because:
- Complex agents that handle large tasks benefit from more context
- Quick-completion agents work better with less, more focused context
- Cost-sensitive agents can be given smaller budgets

### Auto-Approve

```yaml
auto_approve:
  sections: [commands, tags]
  excluded_owners: [security, compliance]
```

Controls which `.ctx` update proposals are automatically applied:
- `sections`: List of section names (e.g., `commands`, `tags`) where
  auto-approval is allowed. Low-risk sections are good candidates.
- `excluded_owners`: Entries with these ownership tags always require
  human review, even if the section is auto-approved.

### Retention

```yaml
retention:
  sessions_days: 30
  audit_days: 90
```

How long to keep data in the local SQLite database:
- `sessions_days`: Session and request event data older than this is purged.
- `audit_days`: Audit log entries older than this are purged.

Purging runs on daemon startup and daily.

## Global Profile

In addition to per-repository profiles, you can create a global personal
profile at `~/.ctxl/config.yaml`:

```yaml
# ~/.ctxl/config.yaml (personal, NOT checked into git)
version: 1

global_ctx: ~/.ctxl/global.ctx    # Personal conventions
budget:
  default_tokens: 4000

ignore:
  never_read:
    - "~/.ssh/"
    - "~/.aws/credentials"
```

You can also create a personal `~/.ctxl/global.ctx` file with conventions
that apply across all your repositories:

```yaml
# ~/.ctxl/global.ctx
version: 1
summary: |
  Personal coding conventions. I prefer functional style,
  explicit error handling (no silent catches), and comprehensive
  test coverage.
```

### Precedence Order

Settings are resolved from most specific to least specific:

1. Per-request override (highest priority)
2. Per-agent config in repo profile
3. Repo profile defaults (`.ctxl/config.yaml`)
4. Global profile defaults (`~/.ctxl/config.yaml`)
5. System defaults (4,000 tokens, lexical mode)

## Commands to Try

### Check effective configuration

```bash
ctxkit config show
```

Expected output:

```
Effective configuration:
  budget.default_tokens: 4000 (from .ctxl/config.yaml)
  scoring.mode: lexical (from .ctxl/config.yaml)
  ignore.never_read: 7 patterns (from .ctxl/config.yaml)
  ignore.never_log: 3 patterns (from .ctxl/config.yaml)
  agents: 3 configured (claude, copilot, internal-review-bot)
  auto_approve.sections: [commands, tags]
  retention.sessions_days: 30
  retention.audit_days: 90
```

### Preview context with a specific agent budget

```bash
# Preview with Claude's 8000-token budget
ctxkit inject --preview \
  --request "refactor the Kafka consumer pipeline" \
  --agent claude \
  --budget 8000

# Preview with Copilot's 2000-token budget
ctxkit inject --preview \
  --request "refactor the Kafka consumer pipeline" \
  --agent copilot \
  --budget 2000
```

Compare the two outputs -- Claude receives more context items while
Copilot gets a focused subset of the most relevant entries.

## Best Practices

- **Track .ctxl/config.yaml in git**: The profile is project-specific
  configuration that the whole team should share. Check it in.

- **Do NOT track ~/.ctxl/config.yaml**: The global profile is personal.
  Keep it out of version control.

- **Start with the defaults**: The system defaults (4,000 tokens, lexical
  mode) work well for most projects. Only customize when you have a
  specific reason.

- **Be conservative with auto-approve**: Start with `sections: []`
  (approve everything manually) until you trust the proposal quality.
  Then gradually add low-risk sections like `commands` and `tags`.

- **Use per-agent budgets for real differences**: Do not create agent
  configs just because you can. Only configure an agent when its budget
  or mode needs to differ from the default.
