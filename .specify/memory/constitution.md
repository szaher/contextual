<!--
  Sync Impact Report
  ==================
  Version change: (none — initial ratification) → 0.1.1
  Modified principles: N/A (initial creation)
  Added sections:
    - Core Principles (4 principles)
    - Quality & Testing Standards (4 subsections)
    - Context & Memory Standards
    - Operational Safety, Observability, and UX
    - Governance
  Removed sections: N/A
  Templates requiring updates:
    - .specify/templates/plan-template.md ✅ no update needed
      (Constitution Check section is dynamically derived)
    - .specify/templates/spec-template.md ✅ no update needed
      (user story / requirements structure is compatible)
    - .specify/templates/tasks-template.md ✅ no update needed
      (task phases and testing guidance are generic)
    - .specify/templates/commands/*.md ✅ no command files exist
  Follow-up TODOs: none
-->

# ctxl Constitution

## Core Principles

### I. Local-First, Private-by-Default

All state (sessions, logs, indexes, caches) MUST stay on the
developer machine. No network access unless explicitly enabled
by the user. Any "export/share" capability MUST be a deliberate,
explicit action with clear scope selection.

- Local storage is the default for every persistent artifact.
- Network calls MUST be opt-in and gated behind user confirmation.
- Exported data MUST show the user exactly what will leave the
  machine before transmission.

### II. Repository Truth Over Guessing

Prefer reading existing files over inventing behavior. Reuse
before you build: search for existing utilities, conventions,
and patterns in the repo. Do not duplicate functionality that
already exists unless the spec explicitly justifies it.

- New code MUST be preceded by a search for existing equivalents.
- Duplication MUST be justified in the spec or plan if introduced.
- Inferred behavior MUST be validated against actual repo state.

### III. Transparent, Inspectable Context Injection

Every injected context item MUST be attributable and explainable:

- Show **source** (file path / `.ctx` path / session event id).
- Show **reason codes** (why it was included).
- Show an **omitted list** (what was considered but left out
  and why).

Users MUST be able to view, edit, and block context injection
at any point in the workflow.

### IV. Deterministic, Budgeted Context

Given the same inputs, the generated Context Pack MUST be stable
in ordering and content (within the same repo state). Always
respect token/size budgets with predictable truncation and
compression rules. Avoid prompt churn.

- Determinism: identical repo state + identical inputs = identical
  Context Pack (ordering, content, truncation boundaries).
- Budget enforcement: every context operation MUST declare and
  respect a token/size ceiling.
- Truncation strategy MUST be documented and predictable (e.g.,
  priority-based eviction, not random).

## Quality & Testing Standards

### E2E + Integration First

Quality is proven primarily through end-to-end (E2E) and
integration tests that exercise real user workflows across
boundaries:

- daemon <-> CLI <-> UI <-> filesystem (`.ctx`)
- session capture <-> context pack generation <->
  inspection/editing <-> apply diff
- drift detection <-> update proposal <-> approval flow

Every feature MUST include:

- At least one integration test (API + filesystem + storage),
  and/or an E2E test that runs the system as a user would
  (start services, run a request, verify injection + logs +
  UI/API responses).

### Unit Tests Are Targeted, Not Default

Unit tests are optional and MUST be used selectively only when
they clearly reduce risk, such as:

- Parsers and schema validation for `.ctx`.
- Scoring/ranking logic and token budgeting (pure functions).
- Redaction/secret detection.
- Concurrency primitives (lock/merge rules) where isolated
  verification is valuable.

Do **not** write unit tests for everything. Prefer fewer,
higher-signal tests that validate behavior through real
interfaces.

### Test Realism

Tests MUST use:

- Real filesystem temp dirs (not heavy mocking).
- Real sqlite (or chosen storage) in test mode.
- Spawned daemon process for E2E where feasible.
- Golden fixtures for context packs (with deterministic ordering).

### Testability Requirements

Design MUST enable testing via public interfaces:

- Stable CLI commands for critical flows (e.g., `ctxkit inject`,
  `ctxkit sessions`, `ctxkit propose`, `ctxkit apply`).
- A local API surface that supports inspection and assertions.
- Deterministic outputs under fixed repo state.

## Context & Memory Standards

- `.ctx` files are human-editable, repo-native, and reviewable
  in git.
- Never write secrets into `.ctx` or logs. Redact/omit anything
  that looks like credentials, tokens, private keys, or
  connection strings.
- `.ctx` updates MUST be proposed as diffs:
  - Default flow: propose -> show diff -> user approves/edits
    -> write.
  - No silent rewrites of user-authored content.
- Support staleness tracking and drift detection (e.g., "last
  verified at commit X" or timestamp).
- Respect ignore policies:
  - Allow users to mark paths as "never read" and "never log".
  - These rules override all other heuristics.
- Prefer minimal context that is sufficient to solve the task;
  deep reads MUST be triggered only when confidence is low or
  when explicitly requested.

## Operational Safety, Observability, and UX

- Local daemon MUST be safe to run continuously (bounded
  CPU/memory, backpressure, and clear shutdown).
- All writes MUST be atomic and concurrency-safe (locking/merge
  strategy) to handle multiple sessions.
- Provide an audit trail for:
  - What context was injected.
  - What memory was updated.
  - Who/what initiated the change.
  - When and why.
- UX MUST make it easy to inspect and correct:
  - Show injected context per request/call.
  - Show token/size estimates.
  - Show diffs before applying memory changes.
- Prefer a small dependency footprint; choose boring,
  well-supported libraries and avoid heavyweight frameworks
  unless justified by the plan.

## Governance

- Constitution changes require an explicit commit and a short
  rationale (1-2 paragraphs) describing:
  - What changed.
  - Why it is needed.
  - Impact on existing workflow.
- If the constitution conflicts with a spec, plan, or task, the
  constitution wins; update the spec/plan/task to match intended
  behavior.
- Use semantic versioning for this constitution:
  - **MAJOR**: backward-incompatible principle removals or
    redefinitions.
  - **MINOR**: new principle/section added or materially expanded
    guidance.
  - **PATCH**: clarifications, wording, typo fixes,
    non-semantic refinements.

**Version**: 0.1.1 | **Ratified**: 2026-02-28 | **Last Amended**: 2026-02-28
