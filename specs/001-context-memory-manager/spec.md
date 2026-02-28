# Feature Specification: Context & Memory Manager

**Feature Branch**: `001-context-memory-manager`
**Created**: 2026-02-28
**Status**: Draft
**Input**: Local "Context & Memory Manager" for coding agents that
remembers important info, manages context efficiently, and injects
the most relevant context into each request or tool call.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Context Pack Assembly (Priority: P1)

A developer is using a coding agent in a repository that has `.ctx`
files at various directory levels. When the agent receives a request
(e.g., "fix the auth bug in the login handler"), the system
automatically loads `.ctx` files from the current working directory
up through parent directories to the repo root, scores each memory
entry for relevance (locality, recency, tags, explicit pins), and
assembles a Context Pack within the declared token budget. The
Context Pack is injected into the agent's prompt, giving it the
most useful project knowledge without reading every file.

The developer can also preview what would be injected for any
hypothetical request before actually sending it, to understand and
tune the system's behavior.

For each item in the Context Pack, the system shows why it was
included (reason codes such as `LOCALITY_HIGH`, `TAG_MATCH`,
`PINNED`, `RECENT_EDIT`) and what was considered but omitted
(with scores and exclusion reasons like `BUDGET_EXCEEDED` or
`LOW_SCORE`).

**Why this priority**: This is the core value proposition. Without
context assembly, the system has no purpose. Every other story
depends on Context Packs existing and being useful.

**Independent Test**: Can be fully tested by placing sample `.ctx`
files in a test repository, issuing a request, and verifying the
resulting Context Pack contains the expected items in deterministic
order within budget. Delivers immediate value: better agent
responses from day one.

**Acceptance Scenarios**:

1. **Given** a repository with `.ctx` files at root, `src/`, and
   `src/auth/`, **When** a request mentioning "auth" is issued from
   `src/auth/`, **Then** the Context Pack includes entries from all
   three levels with `src/auth/.ctx` entries scored highest, entries
   are ordered deterministically, and total tokens stay within the
   declared budget.

2. **Given** the same repository state and the same request text
   issued from the same directory, **When** the context assembly
   runs twice, **Then** both Context Packs are identical in content
   and ordering.

3. **Given** a token budget of N tokens, **When** the available
   context exceeds N, **Then** the system applies predictable
   priority-based truncation, includes the highest-scoring items,
   and lists omitted items with reasons.

4. **Given** a request, **When** the developer asks for a preview
   of what would be injected, **Then** the system shows the full
   Context Pack with source paths, reason codes, token estimates
   per item, and the omitted-items list.

5. **Given** a `.ctx` entry marked as "pinned" by the user,
   **When** context assembly runs, **Then** the pinned entry is
   always included regardless of relevance score (within budget).

6. **Given** a request that touches a path with a context contract
   (must-include invariant), **When** context assembly runs,
   **Then** the contract block is included with reason code
   `CONTRACT_REQUIRED` and a warning if the contract was close to
   being truncated by budget.

---

### User Story 2 - .ctx File Lifecycle (Priority: P2)

A developer starting a new project (or adopting the system in an
existing one) initializes `.ctx` files to capture directory-level
knowledge. Each `.ctx` file is a human-readable, structured
document that lives alongside the code it describes, is tracked in
git, and is reviewable in pull requests.

The developer creates a root `.ctx` with a project summary, key
file map, build/test commands, architectural decisions, and known
gotchas. Subdirectory `.ctx` files capture more specific knowledge
(e.g., the auth module's contracts, the database layer's
invariants). The developer can validate `.ctx` files for structural
correctness and can lock specific entries to prevent automated
changes.

The `.ctx` format supports cross-references between directories to
avoid duplicating the same information in multiple places. Entries
include staleness metadata (last verified commit hash or timestamp)
so the system can track confidence in each piece of knowledge.

Users can also assign ownership tags to entries (e.g., "security-
owned" decisions) and designate entries as "review required" so
that proposed changes to those entries always require explicit
human approval even if auto-approve is enabled elsewhere.

**Why this priority**: `.ctx` files are the foundational data layer.
Context Packs (P1) read from them. Memory updates (P3) write to
them. Without a clear format and lifecycle, nothing else works
reliably.

**Independent Test**: Can be tested by initializing `.ctx` in a
sample repo, validating structure, editing entries, locking an
entry, and confirming the file remains human-readable and
git-diffable. Delivers value: structured project knowledge that
any team member (or agent) can read.

**Acceptance Scenarios**:

1. **Given** a repository without `.ctx` files, **When** the
   developer initializes `.ctx` at the repo root, **Then** a valid
   `.ctx` file is created with the required sections (summary, key
   files, commands) pre-populated from available repo metadata
   (README, package files, etc.).

2. **Given** a `.ctx` file, **When** the developer runs validation,
   **Then** the system reports structural errors (missing required
   sections, malformed entries) and warns about content issues
   (e.g., references to non-existent files).

3. **Given** a `.ctx` file with a "decisions" entry, **When** the
   developer marks that entry as locked/pinned, **Then** automated
   update proposals skip that entry and the lock is visible in
   the file.

4. **Given** `.ctx` files at root and `src/auth/`, **When** context
   is loaded for `src/auth/`, **Then** entries from `src/auth/.ctx`
   take precedence over root entries for overlapping topics, and
   shared entries from root are inherited without duplication.

5. **Given** a `.ctx` entry that references a file at a specific
   path, **When** the developer links to a deeper source (file,
   doc, line range), **Then** the link is preserved as a reference
   without copying the full content into `.ctx`.

6. **Given** a `.ctx` entry tagged with `owner: security`, **When**
   an automated update is proposed for that entry, **Then** the
   proposal is flagged as "review required" regardless of any
   auto-approve settings.

---

### User Story 3 - Memory Update Proposals (Priority: P3)

After a coding agent completes a task (fixing a bug, adding a
feature, discovering a new convention), the system analyzes what
changed and proposes updates to the relevant `.ctx` files. The
developer sees a diff of the proposed changes, can edit the diff,
and approves or rejects each change before it is written.

The system also periodically proposes pruning of entries that appear
stale (e.g., referencing deleted files or outdated patterns), always
with visible justification for why the entry is considered stale.

Each proposal includes an explanation of how the change was learned
(e.g., "learned from file X / commit Y") so the developer can
assess trustworthiness.

**Why this priority**: Without automated update proposals, `.ctx`
files become a manual chore and quickly go stale. This story turns
the system from a static reference into a living, self-maintaining
knowledge base.

**Independent Test**: Can be tested by simulating a completed task
(e.g., renaming a function), verifying the system proposes a `.ctx`
diff reflecting the rename, and confirming the diff is not applied
until the user approves. Delivers value: `.ctx` stays current with
minimal manual effort.

**Acceptance Scenarios**:

1. **Given** a completed task that renamed a public function,
   **When** the system analyzes the changes, **Then** it proposes
   an update to the relevant `.ctx` entry with a diff showing the
   old and new function name, and the reason "referenced symbol
   renamed."

2. **Given** a proposed `.ctx` update, **When** the developer
   reviews it, **Then** the developer can approve, edit, or reject
   the change. Only approved changes are written.

3. **Given** a `.ctx` entry referencing a file that was deleted
   from the repo, **When** the system runs a staleness check,
   **Then** it proposes removing or updating the entry with a
   justification citing the deleted file path.

4. **Given** a `.ctx` entry marked as locked/pinned, **When** the
   system detects that the entry content is stale, **Then** it
   surfaces a notification to the developer but does NOT propose
   an automated change to that entry.

5. **Given** two concurrent agent sessions that both propose
   updates to the same `.ctx` file, **When** both proposals are
   approved, **Then** the writes are applied atomically without
   data loss or corruption (merge or ordered application).

6. **Given** the developer enables "auto-approve future updates"
   for a specific `.ctx` section, **When** subsequent proposals
   target that section, **Then** they are applied automatically
   (unless the entry has an ownership tag requiring review).

---

### User Story 4 - Session & Request Tracking (Priority: P4)

A developer wants to understand what context was provided to a
coding agent during a specific request. They open the session
tracker and see a list of active and recent sessions, each with a
timeline of requests and tool calls. For any request, they can
drill down to see exactly what context was injected, the token
count, the source paths, the reason codes for each included item,
and what was omitted.

The system also records decisions like "skipped `.ctx`, read files
directly" (deep-read triggers) and proposed `.ctx` diffs, creating
a complete audit trail.

**Why this priority**: Observability is essential for trust and
debugging. If the developer cannot see what context was injected,
they cannot diagnose bad agent responses or tune the system. This
story makes the system transparent.

**Independent Test**: Can be tested by running an agent session
with multiple requests, then querying the session tracker to verify
all events are recorded with correct context attribution. Delivers
value: full visibility into agent behavior.

**Acceptance Scenarios**:

1. **Given** an active coding agent session, **When** the developer
   queries the session tracker, **Then** the session appears in the
   active sessions list with its start time, request count, and
   working directory.

2. **Given** a session with three completed requests, **When** the
   developer inspects the session timeline, **Then** each request
   shows: the request text, the injected Context Pack, token
   estimates per item, source paths, and reason codes.

3. **Given** a completed request where items were omitted due to
   budget, **When** the developer inspects that request, **Then**
   the omitted items are listed with their would-be scores and the
   reason they were excluded (e.g., "budget exceeded, score 0.42
   below cutoff 0.55").

4. **Given** a memory change (`.ctx` update) that occurred during
   a session, **When** the developer views the audit log, **Then**
   the log entry shows what changed, who/what initiated it, when,
   and why.

5. **Given** a request where the system bypassed `.ctx` and read
   files directly, **When** the developer inspects that request,
   **Then** the timeline shows the deep-read decision with
   rationale (e.g., "low confidence: missing symbol `AuthService`
   in `.ctx`").

---

### User Story 5 - Drift Detection (Priority: P5)

Over time, code evolves and `.ctx` files may reference files that
were moved, functions that were renamed, or patterns that are no
longer in use. The system monitors for drift between `.ctx` content
and actual repo state. When drift is detected, it surfaces the
discrepancies and proposes targeted updates.

Drift signals also feed back into context assembly: stale entries
are down-ranked so they are less likely to be injected, and the
dashboard shows "stale badges" on affected entries.

**Why this priority**: Drift degrades context quality silently. By
detecting it proactively, the system prevents injecting misleading
or outdated context into agent requests.

**Independent Test**: Can be tested by creating a `.ctx` file
referencing specific files/symbols, then modifying or deleting
those files, and verifying the system flags the stale references
with actionable proposals. Delivers value: reliable memory that
tracks code reality.

**Acceptance Scenarios**:

1. **Given** a `.ctx` entry that references `src/auth/login.ts`,
   **When** that file is renamed to `src/auth/sign-in.ts`, **Then**
   the system flags the entry as drifted and proposes updating the
   file reference.

2. **Given** a `.ctx` entry with staleness metadata ("last verified
   at commit abc123"), **When** any file referenced by that entry
   has been modified since that commit, **Then** the system marks
   the entry as potentially stale and prioritizes it for
   re-verification.

3. **Given** a `.ctx` entry describing an API contract, **When** the
   actual API signature changes in code, **Then** the system detects
   the mismatch and proposes a `.ctx` update reflecting the new
   signature.

4. **Given** drift detected on a locked/pinned entry, **When** the
   system surfaces the drift, **Then** it presents a warning
   without auto-proposing changes, allowing the developer to decide.

5. **Given** stale entries in `.ctx`, **When** context assembly
   runs, **Then** stale entries are down-ranked in relevance
   scoring and the Context Pack attribution shows a staleness
   indicator.

---

### User Story 6 - Local Inspection Dashboard (Priority: P6)

A developer opens a local web interface on their machine to get a
visual overview of all running agent sessions, inspect what context
was injected per request, edit `.ctx` files with diff preview, and
browse the audit log. The dashboard runs entirely locally with no
network access and provides a low-friction way to manage context
and memory.

The dashboard also shows staleness/drift warnings with approve/
apply workflows, supports searching across memories and sessions,
and displays token estimates to help developers understand context
costs.

**Why this priority**: While all core functionality is accessible
via command-line, the dashboard provides a significantly better
experience for inspection, editing, and audit review. It is the
polish layer that makes the system practical for daily use.

**Independent Test**: Can be tested by starting the dashboard,
navigating to a session, inspecting a request's context, editing a
`.ctx` entry via the UI, previewing the diff, and applying the
change. Delivers value: visual, low-friction memory management.

**Acceptance Scenarios**:

1. **Given** the system is running with active sessions, **When**
   the developer opens the dashboard, **Then** they see a list of
   active and recent sessions with summary information (start time,
   request count, working directory).

2. **Given** a session in the dashboard, **When** the developer
   clicks on a specific request, **Then** they see the injected
   Context Pack, token estimates, source paths, reason codes, and
   omitted items.

3. **Given** the dashboard's `.ctx` editor, **When** the developer
   edits an entry and clicks "preview," **Then** they see a diff
   of the proposed changes. When they click "apply," the changes
   are written to the `.ctx` file.

4. **Given** the audit log view, **When** the developer filters
   by date range or `.ctx` file path, **Then** they see all memory
   changes matching the filter with full attribution (who, when,
   why, diff).

5. **Given** the dashboard is running, **When** no network access
   is configured, **Then** the dashboard functions fully with all
   data served from the local machine.

6. **Given** the dashboard search, **When** the developer searches
   for a keyword across memories and sessions, **Then** matching
   results are returned with highlighted context and links to the
   source entries.

---

### User Story 7 - Agent Integration Wrapper (Priority: P7)

A developer wants to use the context system with their existing
coding agent without rewriting the agent. They use a drop-in
wrapper that intercepts agent prompts and tool calls, requests a
Context Pack from the system, and injects it transparently. The
wrapper supports multiple integration modes: wrapping an existing
CLI agent command, connecting via a local API for IDE plugins or
custom agents, and configuring per-agent budgets and modes.

**Why this priority**: Adoption depends on ease of integration. If
developers must modify their agents to use the system, adoption
will be low. A drop-in wrapper removes that barrier.

**Independent Test**: Can be tested by wrapping a sample agent
command, issuing a request through the wrapper, and verifying that
the Context Pack was injected into the agent's input and the
session was recorded. Delivers value: instant adoption path for
any coding agent.

**Acceptance Scenarios**:

1. **Given** an existing coding agent CLI command, **When** the
   developer runs it through the integration wrapper, **Then** the
   agent receives its normal input plus the injected Context Pack,
   and the session is logged.

2. **Given** the local API is running, **When** a custom agent or
   IDE plugin sends a request event, **Then** the system returns a
   Context Pack and records the session event.

3. **Given** per-agent configuration with different token budgets,
   **When** two agents with different budgets make requests in the
   same repository, **Then** each receives a Context Pack sized to
   its configured budget.

4. **Given** the wrapper is active, **When** the wrapped agent
   makes tool calls, **Then** each tool call is recorded in the
   session timeline alongside the injected context.

---

### User Story 8 - Replay & Regression Harness (Priority: P8)

A developer or team wants to verify that context assembly behavior
is stable across code changes. They use a replay harness that takes
recorded sessions (or scripted scenarios) and replays them against a
fixed repository snapshot. The harness verifies determinism of
context packs, token budget adherence, stable reason codes, and
expected drift warnings and proposal diffs.

**Why this priority**: As the system matures, regressions in context
selection can silently degrade agent quality. A replay harness
provides confidence that changes to the system or to `.ctx` files
do not break expected behavior.

**Independent Test**: Can be tested by recording a session, making
a change to the scoring logic or `.ctx` content, replaying the
session, and verifying the harness reports the expected differences.
Delivers value: regression safety for context quality.

**Acceptance Scenarios**:

1. **Given** a recorded session and a fixed repository snapshot,
   **When** the harness replays the session, **Then** the generated
   Context Packs match the original packs exactly (determinism
   check).

2. **Given** a scripted scenario with expected context items,
   **When** the harness runs the scenario, **Then** it reports
   pass/fail for each expected item with detailed output on
   mismatches.

3. **Given** a replay after a `.ctx` change, **When** the Context
   Pack differs from the original, **Then** the harness shows a
   clear diff of what changed with reason codes explaining the
   difference.

4. **Given** a set of regression scenarios, **When** run as part
   of a test suite, **Then** the harness exits with a non-zero
   code on failure, suitable for integration into CI workflows.

---

### User Story 9 - Workspace Profiles (Priority: P9)

A developer works across multiple repositories with different
conventions, budgets, and policies. They configure per-repository
profiles that store settings: token budgets, allowed retrieval
modes, ignore rules, default pinned items, and preferred agents.
They also maintain a personal global context file for conventions
that apply across all their projects.

**Why this priority**: Developers who work on multiple projects need
the system to adapt automatically. Without profiles, they would
need to reconfigure the system each time they switch repos.

**Independent Test**: Can be tested by creating two profiles with
different budgets and ignore rules, switching between repos, and
verifying each repo uses its configured profile. Delivers value:
seamless multi-project experience.

**Acceptance Scenarios**:

1. **Given** a developer with profiles for repo A (budget: 4000
   tokens) and repo B (budget: 8000 tokens), **When** they work
   in repo A, **Then** Context Packs respect the 4000-token budget
   without manual reconfiguration.

2. **Given** a global personal context file with the developer's
   coding conventions, **When** working in any repository, **Then**
   the global context is available as a low-priority source that
   can be overridden by repo-level `.ctx`.

3. **Given** a profile with ignore rules for `vendor/` and
   `node_modules/`, **When** context assembly runs in that repo,
   **Then** those paths are excluded from reads and scoring.

---

### User Story 10 - Context Contracts & Guardrails (Priority: P10)

A team defines invariants and constraints that MUST be injected
whenever a request touches certain areas of the codebase. For
example, security constraints for the auth module, API
compatibility rules for the public interface, or data privacy
requirements for the user-data layer. When a request touches
paths or tags associated with a contract, the Context Pack
MUST include the relevant contract block and any warnings.

**Why this priority**: Agents can cause incidents when they violate
project constraints they were not told about. Contracts ensure
that critical guardrails are always present in context when
relevant, preventing "agent-caused incidents."

**Independent Test**: Can be tested by defining a security contract
for `src/auth/`, making a request that touches auth files, and
verifying the contract block appears in the Context Pack with
reason code `CONTRACT_REQUIRED`. Delivers value: safety net for
critical project rules.

**Acceptance Scenarios**:

1. **Given** a contract defined for paths matching `src/auth/*`,
   **When** a request touches `src/auth/handler.ts`, **Then** the
   Context Pack includes the contract block with reason code
   `CONTRACT_REQUIRED`.

2. **Given** a contract associated with the tag `security`,
   **When** a request is scored and the tag matches, **Then** the
   contract is included even if its relevance score would normally
   place it below the budget cutoff.

3. **Given** a contract that would exceed the remaining token
   budget, **When** context assembly runs, **Then** the system
   includes the contract (contracts take priority over non-contract
   items) and emits a warning that the budget was stretched.

4. **Given** a contract block, **When** no request touches its
   associated paths or tags, **Then** the contract is NOT injected
   (contracts are conditional, not unconditional).

---

### Edge Cases

- **Empty repository**: No `.ctx` files exist at any level; the
  system produces an empty Context Pack and suggests initializing
  `.ctx`.
- **Token budget too small**: The declared budget cannot fit even
  the highest-priority item; the system returns an error or warning
  with the minimum budget needed for meaningful context.
- **Circular cross-references**: `.ctx` files reference each other
  in a cycle; the system detects the cycle and breaks it with a
  warning.
- **Concurrent conflicting updates**: Two sessions propose
  contradictory changes to the same `.ctx` entry; the system
  preserves both proposals for user resolution rather than silently
  picking one.
- **Extremely large repository**: Hundreds of `.ctx` files across
  deep directory trees; context assembly completes within
  acceptable time and memory bounds.
- **Deleted file references**: `.ctx` references a file that no
  longer exists; drift detection flags it, and context assembly
  excludes or deprioritizes the stale entry.
- **Locked entry with drift**: A pinned entry is stale; the system
  warns but does not auto-modify.
- **No relevant context**: A request has no meaningful match to any
  `.ctx` content; the system returns a minimal or empty Context
  Pack and indicates low confidence, optionally triggering direct
  file reads.
- **Secrets in proposed updates**: An automated update proposal
  includes content that looks like a credential or token; the
  system redacts the sensitive content before proposing.
- **Contract budget conflict**: Multiple contracts apply to a
  request and their combined size exceeds the budget; the system
  includes all contracts (they are mandatory) and truncates
  non-contract items, emitting a warning.
- **Global and repo context conflict**: A global personal context
  entry contradicts a repo-level `.ctx` entry; repo-level wins
  and the conflict is surfaced to the developer.

## Requirements *(mandatory)*

### Functional Requirements

**Context Assembly**

- **FR-001**: System MUST load `.ctx` files hierarchically from the
  current working directory up through parent directories to the
  repository root.
- **FR-002**: System MUST score each `.ctx` entry for relevance
  using locality (distance from working directory), recency (last
  edit/verification time), tag matching, and explicit pins.
- **FR-003**: System MUST assemble a Context Pack that respects a
  declared token/size budget with predictable, priority-based
  truncation. The default budget is 4,000 tokens. Users MUST be
  able to override this default at the repository profile level,
  per-agent level, or per-request level (most specific wins).
- **FR-004**: System MUST produce deterministic Context Pack output
  (identical ordering and content) given the same inputs and repo
  state.
- **FR-005**: System MUST include attribution for every Context
  Pack item: source `.ctx` path, reason codes (e.g.,
  `LOCALITY_HIGH`, `TAG_MATCH`, `PINNED`, `RECENT_EDIT`,
  `CONTRACT_REQUIRED`, `DEEP_READ`).
- **FR-006**: System MUST include an "omitted items" list showing
  entries that were considered but excluded, with scores and
  exclusion reasons.
- **FR-007**: System MUST support a "deep read" fallback heuristic
  that bypasses `.ctx` and reads files directly when confidence is
  low, `.ctx` is missing/stale, symbols cannot be resolved, or
  the user intent signals deep analysis (e.g., "refactor",
  "debug failing test"). Deep-read decisions MUST be logged with
  rationale and the minimal set of files to open.
- **FR-008**: System MUST support context contracts (must-include
  invariants) that are injected whenever a request touches
  associated paths or tags. Contracts take priority over
  non-contract items during budget allocation.

**.ctx File Format & Lifecycle**

- **FR-009**: `.ctx` files MUST be human-readable, structured,
  and reviewable in standard git diff/PR workflows.
- **FR-010**: `.ctx` files MUST support the following content
  sections: summary (5-15 lines), key files (path to purpose
  mapping), contracts/interfaces, decisions (with rationale, date,
  and alternatives), commands (build/test/run), gotchas/known
  issues, retrieval tags, and links to deeper sources.
- **FR-011**: `.ctx` files MUST include staleness metadata per
  entry (last verified commit hash or timestamp).
- **FR-012**: System MUST support a lock/pin mechanism allowing
  users to prevent automated edits to specific `.ctx` entries.
- **FR-013**: System MUST support ownership tags on `.ctx` entries
  (e.g., `owner: security`) with configurable review requirements
  per ownership tag.
- **FR-014**: System MUST support hierarchical merge rules where
  subdirectory `.ctx` entries take precedence over parent entries
  for overlapping topics, and shared entries are inherited without
  duplication.
- **FR-015**: System MUST support cross-references between `.ctx`
  files (linking to deeper sources by path and line range, and
  referencing shared context blocks) to avoid duplicating
  information across directories.
- **FR-016**: System MUST provide a way to initialize `.ctx` in a
  repository, pre-populating sections from available metadata.
- **FR-017**: System MUST validate `.ctx` files for structural
  correctness and warn about content issues (e.g., references to
  non-existent files).
- **FR-017a**: `.ctx` files MUST include a version field identifying
  the schema version. When the system loads a `.ctx` file with an
  older schema version, it MUST automatically migrate the file
  in-place to the current version, preserving all user content.
  Migration MUST be non-destructive and produce a minimal diff.

**Memory Updates**

- **FR-018**: System MUST propose `.ctx` updates as reviewable
  diffs (propose -> show diff -> user approves/edits -> write).
- **FR-019**: System MUST NOT silently rewrite user-authored `.ctx`
  content; all changes require explicit user approval.
- **FR-020**: System MUST support auto-pruning proposals for stale
  entries with user-visible justification for each proposed removal.
- **FR-021**: System MUST handle concurrent `.ctx` updates from
  multiple sessions with atomic writes and a merge/conflict
  resolution strategy that prevents data loss.
- **FR-022**: System MUST include provenance in each proposal
  explaining how the change was learned (source file, commit,
  event that triggered it).
- **FR-023**: System MUST support an "auto-approve" toggle for
  specific `.ctx` sections, allowing future proposals targeting
  those sections to be applied without manual review (unless
  overridden by ownership review requirements).

**Drift Detection**

- **FR-024**: System MUST detect when `.ctx` entries reference
  moved, renamed, or deleted files.
- **FR-025**: System MUST detect when `.ctx` entries describe
  contracts or interfaces that have changed in the codebase.
- **FR-026**: System MUST surface drift as update proposals with
  clear justification citing the specific discrepancy.
- **FR-027**: System MUST down-rank stale entries in relevance
  scoring and show staleness indicators in Context Pack
  attribution. An entry is considered stale when any file it
  references has been modified since the entry's last verification
  commit.

**Session Tracking & Observability**

- **FR-028**: System MUST record agent sessions with per-request
  timelines including request text, injected context, token
  estimates, source paths, reason codes, and deep-read decisions.
- **FR-029**: System MUST maintain an audit log of all memory
  changes: what changed, who/what initiated, when, and why.
- **FR-030**: System MUST expose session and audit data through
  an inspectable interface (both programmatic and visual).
- **FR-031**: System MUST support filtering sessions and audit
  entries by repository, branch, date range, and file path.
- **FR-031a**: System MUST automatically purge session data older
  than 30 days and audit log entries older than 90 days. Retention
  periods MUST be user-configurable.

**Security & Privacy**

- **FR-032**: System MUST NOT store secrets (credentials, tokens,
  private keys, connection strings) in `.ctx` files or logs.
- **FR-033**: System MUST redact content that matches known
  credential/token patterns before proposing `.ctx` updates or
  writing logs.
- **FR-034**: System MUST support user-defined "never read" and
  "never log" path policies that override all other heuristics.
  Deny-list semantics: blocked paths always win over inclusion
  rules.
- **FR-035**: All data MUST remain on the local machine by default;
  any export or sharing MUST be an explicit, deliberate user action
  with clear scope selection.

**Agent Integration**

- **FR-036**: System MUST provide a drop-in wrapper that intercepts
  agent prompts and tool calls to inject Context Packs without
  requiring agent modification.
- **FR-037**: System MUST expose a local API for IDE plugins and
  custom agents to request Context Packs and report session events.
- **FR-038**: System MUST support per-agent configuration of token
  budgets, retrieval modes, and injection behavior.

**Local Dashboard**

- **FR-039**: System MUST provide a local visual interface for
  browsing sessions, inspecting per-request context, editing `.ctx`
  files with diff preview, and viewing audit logs.
- **FR-040**: The dashboard MUST function entirely locally with no
  network access required.
- **FR-041**: The dashboard MUST support search across memories
  and sessions with highlighted results.
- **FR-042**: The dashboard MUST display staleness/drift warnings
  with approve/apply workflows.

**Replay & Regression**

- **FR-043**: System MUST provide a replay harness that runs
  recorded sessions or scripted scenarios against a fixed
  repository snapshot and verifies determinism, budget adherence,
  reason code stability, and expected drift/proposal outputs.
- **FR-044**: The replay harness MUST produce machine-readable
  pass/fail results suitable for integration into test suites.

**Workspace Profiles**

- **FR-045**: System MUST support per-repository profiles storing
  token budgets, retrieval modes, ignore rules, default pinned
  items, and agent configurations.
- **FR-046**: System MUST support a global personal context file
  for conventions that apply across all repositories, with
  repo-level `.ctx` taking precedence on conflicts.

### Key Entities

- **`.ctx` File**: A human-readable, structured memory document
  scoped to a specific directory. Contains summary, key files,
  contracts, decisions, commands, gotchas, tags, staleness metadata,
  ownership tags, and links. Tracked in git.

- **Context Pack**: The assembled payload injected into an agent's
  prompt for a specific request. Contains selected memory items
  with source attribution, reason codes, and token accounting.
  Includes an omitted-items list. Deterministic for identical
  inputs.

- **Context Contract**: A must-include invariant associated with
  specific paths or tags. When a request touches the associated
  scope, the contract block is injected with priority over
  non-contract items.

- **Session**: A sequence of agent interactions (requests and tool
  calls) on a developer's machine. Has a start time, working
  directory, and a timeline of request events.

- **Request Event**: A single agent request within a session.
  Records the request text, the Context Pack that was injected,
  token usage, deep-read decisions, and any `.ctx` update proposals
  triggered.

- **Memory Diff**: A proposed change to a `.ctx` file, presented
  as a diff with justification and provenance. Has a lifecycle:
  proposed -> reviewed -> approved/rejected -> applied.

- **Ignore Policy**: A user-defined rule marking specific paths as
  "never read" or "never log." Overrides all heuristics with
  deny-list semantics.

- **Reason Code**: A label explaining why a specific `.ctx` entry
  was included in or excluded from a Context Pack (e.g.,
  `LOCALITY_HIGH`, `TAG_MATCH`, `PINNED`, `BUDGET_EXCEEDED`,
  `CONTRACT_REQUIRED`).

- **Workspace Profile**: Per-repository or global configuration
  storing budgets, modes, policies, and agent settings.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Given the same request text, working directory, and
  repository state, the system produces an identical Context Pack
  (same items, same ordering) on every run.

- **SC-002**: The Context Pack respects the declared token budget
  100% of the time; no Context Pack exceeds its budget ceiling
  (except when contract items force a documented overage).

- **SC-003**: A developer can inspect the full injected context
  (items, sources, reasons, token estimates) for any past request
  within 3 interactions from the entry point.

- **SC-004**: Proposed `.ctx` updates produce minimal diffs: only
  changed entries are touched, unchanged content is preserved
  byte-for-byte.

- **SC-005**: When a file referenced in `.ctx` is moved or deleted,
  the system detects the drift and surfaces an update proposal
  within the next context assembly or staleness check cycle.

- **SC-006**: Two concurrent sessions proposing updates to the same
  `.ctx` file both complete without data loss or corruption.

- **SC-007**: No `.ctx` content is modified without the developer
  explicitly approving the change (zero silent rewrites).

- **SC-008**: No secrets (credentials, tokens, private keys) appear
  in `.ctx` files or system logs, verified by scanning outputs
  against known credential patterns.

- **SC-009**: The system runs as a background service on a developer
  machine without exceeding defined resource bounds (bounded CPU
  and memory usage, graceful shutdown).

- **SC-009a**: Context Pack assembly completes within 500ms for
  repositories with up to 100 `.ctx` files under typical conditions
  (on-demand scanning without requiring pre-built indexes).

- **SC-010**: End-to-end demo scenario completes successfully:
  start the system, wrap a sample agent, issue a request, receive
  a Context Pack with correct attribution, trigger a `.ctx` update
  proposal, approve it, and verify the change in the audit log and
  dashboard.

- **SC-011**: Replay harness reproduces recorded sessions with
  identical Context Packs against the same repository snapshot
  (regression check).

- **SC-012**: Context contracts are injected 100% of the time when
  a request touches associated paths or tags; zero missed contract
  injections.

## Clarifications

### Session 2026-02-28

- Q: What is the default token budget for Context Pack assembly? → A: 4,000 tokens (balanced default). Configurable per-repo, per-agent, or per-request (most specific wins).
- Q: How long should session data and audit logs be retained? → A: 30 days for sessions, 90 days for audit logs. Both configurable.
- Q: How should .ctx format versioning and migration be handled? → A: Version field in each .ctx file + automatic in-place migration on load. Non-destructive, minimal diff.
- Q: What is the maximum acceptable latency for Context Pack assembly? → A: 500ms for repos with up to 100 .ctx files. On-demand scanning without pre-built indexes.
- Q: What triggers the staleness threshold for a .ctx entry? → A: Change-based: entry is stale when any file it references has been modified since last verification commit.

## Assumptions

- **Single machine**: The system runs on a single developer machine.
  Multi-machine synchronization is out of scope; multiple concurrent
  agent sessions on the same machine are in scope.
- **MVP scoring**: The initial release uses text-based relevance
  scoring (locality, recency, tags, pins). Semantic/embedding-based
  scoring is a planned enhancement beyond MVP, behind a pluggable
  interface that supports hybrid ranking, caching, and offline mode.
- **Format-agnostic at spec level**: The specific `.ctx` file format
  (YAML, Markdown-with-frontmatter, etc.) is a planning/design
  decision, not a spec constraint. The spec requires human-readable,
  structured, and git-diffable.
- **Agent-agnostic**: The system works with any coding agent that
  can emit request events and receive injected context. It is not
  tied to a specific agent product.
- **Background service model**: The system runs as a continuously
  available local service that agents communicate with, rather than
  being invoked per-request as a standalone process.
- **No online dependencies for MVP**: The MVP functions entirely
  offline. Optional embedding providers (local or remote) are a v1
  enhancement and must not be required for core functionality.
