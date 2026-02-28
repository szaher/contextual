# Feature Specification: Context & Memory Manager

**Feature Branch**: `001-context-memory-manager`
**Created**: 2026-02-28
**Status**: Draft
**Input**: Local "Context & Memory Manager" for coding agents that remembers important info, manages context efficiently, and injects the most relevant context into each request or tool call.

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
   Context Pack with source paths, reason codes (e.g.,
   `LOCALITY_HIGH`, `TAG_MATCH`, `PINNED`, `RECENT_EDIT`), token
   estimates, and the omitted-items list.

5. **Given** a `.ctx` entry marked as "pinned" by the user,
   **When** context assembly runs, **Then** the pinned entry is
   always included regardless of relevance score (within budget).

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

---

### User Story 4 - Session & Request Tracking (Priority: P4)

A developer wants to understand what context was provided to a
coding agent during a specific request. They open the session
tracker and see a list of active and recent sessions, each with a
timeline of requests and tool calls. For any request, they can
drill down to see exactly what context was injected, the token
count, the source paths, the reason codes for each included item,
and what was omitted.

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

---

### User Story 5 - Drift Detection (Priority: P5)

Over time, code evolves and `.ctx` files may reference files that
were moved, functions that were renamed, or patterns that are no
longer in use. The system monitors for drift between `.ctx` content
and actual repo state. When drift is detected, it surfaces the
discrepancies and proposes targeted updates.

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
   at commit abc123"), **When** the repo has advanced significantly
   beyond that commit, **Then** the system marks the entry as
   potentially stale and prioritizes it for re-verification.

3. **Given** a `.ctx` entry describing an API contract, **When** the
   actual API signature changes in code, **Then** the system detects
   the mismatch and proposes a `.ctx` update reflecting the new
   signature.

4. **Given** drift detected on a locked/pinned entry, **When** the
   system surfaces the drift, **Then** it presents a warning
   without auto-proposing changes, allowing the developer to decide.

---

### User Story 6 - Local Inspection Dashboard (Priority: P6)

A developer opens a local web interface on their machine to get a
visual overview of all running agent sessions, inspect what context
was injected per request, edit `.ctx` files with diff preview, and
browse the audit log. The dashboard runs entirely locally with no
network access and provides a low-friction way to manage context
and memory.

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
  truncation.
- **FR-004**: System MUST produce deterministic Context Pack output
  (identical ordering and content) given the same inputs and repo
  state.
- **FR-005**: System MUST include attribution for every Context
  Pack item: source `.ctx` path, reason codes (e.g.,
  `LOCALITY_HIGH`, `TAG_MATCH`, `PINNED`, `RECENT_EDIT`,
  `SEMANTIC_TOPK`).
- **FR-006**: System MUST include an "omitted items" list showing
  entries that were considered but excluded, with scores and
  exclusion reasons.
- **FR-007**: System MUST support a "deep read" fallback heuristic
  that bypasses `.ctx` and reads files directly when confidence is
  low, `.ctx` is missing/stale, or symbols cannot be resolved.

**.ctx File Format & Lifecycle**

- **FR-008**: `.ctx` files MUST be human-readable, structured,
  and reviewable in standard git diff/PR workflows.
- **FR-009**: `.ctx` files MUST support the following content
  sections: summary (5-15 lines), key files (path to purpose
  mapping), contracts/interfaces, decisions (with rationale, date,
  and alternatives), commands (build/test/run), gotchas/known
  issues, retrieval tags, and links to deeper sources.
- **FR-010**: `.ctx` files MUST include staleness metadata per
  entry (last verified commit hash or timestamp).
- **FR-011**: System MUST support a lock/pin mechanism allowing
  users to prevent automated edits to specific `.ctx` entries.
- **FR-012**: System MUST support hierarchical merge rules where
  subdirectory `.ctx` entries take precedence over parent entries
  for overlapping topics, and shared entries are inherited without
  duplication.
- **FR-013**: System MUST support cross-references between `.ctx`
  files (linking to deeper sources by path and line range) to avoid
  duplicating information across directories.
- **FR-014**: System MUST provide a way to initialize `.ctx` in a
  repository, pre-populating sections from available metadata.
- **FR-015**: System MUST validate `.ctx` files for structural
  correctness and warn about content issues (e.g., references to
  non-existent files).

**Memory Updates**

- **FR-016**: System MUST propose `.ctx` updates as reviewable
  diffs (propose -> show diff -> user approves/edits -> write).
- **FR-017**: System MUST NOT silently rewrite user-authored `.ctx`
  content; all changes require explicit user approval.
- **FR-018**: System MUST support auto-pruning proposals for stale
  entries with user-visible justification for each proposed removal.
- **FR-019**: System MUST handle concurrent `.ctx` updates from
  multiple sessions with atomic writes and a merge/conflict
  resolution strategy that prevents data loss.

**Drift Detection**

- **FR-020**: System MUST detect when `.ctx` entries reference
  moved, renamed, or deleted files.
- **FR-021**: System MUST detect when `.ctx` entries describe
  contracts or interfaces that have changed in the codebase.
- **FR-022**: System MUST surface drift as update proposals with
  clear justification citing the specific discrepancy.

**Session Tracking & Observability**

- **FR-023**: System MUST record agent sessions with per-request
  timelines including request text, injected context, token
  estimates, source paths, and reason codes.
- **FR-024**: System MUST maintain an audit log of all memory
  changes: what changed, who/what initiated, when, and why.
- **FR-025**: System MUST expose session and audit data through
  an inspectable interface (both programmatic and visual).

**Security & Privacy**

- **FR-026**: System MUST NOT store secrets (credentials, tokens,
  private keys, connection strings) in `.ctx` files or logs.
- **FR-027**: System MUST redact content that matches known
  credential/token patterns before proposing `.ctx` updates or
  writing logs.
- **FR-028**: System MUST support user-defined "never read" and
  "never log" path policies that override all other heuristics.
- **FR-029**: All data MUST remain on the local machine by default;
  any export or sharing MUST be an explicit, deliberate user action
  with clear scope selection.

**Local Dashboard**

- **FR-030**: System MUST provide a local visual interface for
  browsing sessions, inspecting per-request context, editing `.ctx`
  files with diff preview, and viewing audit logs.
- **FR-031**: The dashboard MUST function entirely locally with no
  network access required.

### Key Entities

- **`.ctx` File**: A human-readable, structured memory document
  scoped to a specific directory. Contains summary, key files,
  contracts, decisions, commands, gotchas, tags, staleness metadata,
  and links. Tracked in git alongside the code it describes.

- **Context Pack**: The assembled payload injected into an agent's
  prompt for a specific request. Contains selected memory items
  with source attribution, reason codes, and token accounting.
  Includes an omitted-items list. Deterministic for identical
  inputs.

- **Session**: A sequence of agent interactions (requests and tool
  calls) on a developer's machine. Has a start time, working
  directory, and a timeline of request events. Can be active or
  completed.

- **Request Event**: A single agent request within a session.
  Records the request text, the Context Pack that was injected,
  token usage, and any `.ctx` update proposals triggered.

- **Memory Diff**: A proposed change to a `.ctx` file, presented
  as a diff with justification. Has a lifecycle: proposed ->
  reviewed -> approved/rejected -> applied.

- **Ignore Policy**: A user-defined rule marking specific paths as
  "never read" or "never log." Overrides all heuristics and scoring.

- **Reason Code**: A label explaining why a specific `.ctx` entry
  was included in or excluded from a Context Pack (e.g.,
  `LOCALITY_HIGH`, `TAG_MATCH`, `PINNED`, `BUDGET_EXCEEDED`).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Given the same request text, working directory, and
  repository state, the system produces an identical Context Pack
  (same items, same ordering) on every run.

- **SC-002**: The Context Pack respects the declared token budget
  100% of the time; no Context Pack exceeds its budget ceiling.

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

- **SC-010**: End-to-end demo scenario completes successfully:
  start the system, issue a sample request, receive a Context Pack
  with correct attribution, trigger a `.ctx` update proposal,
  approve it, and verify the change in the audit log.

## Assumptions

- **Single machine**: The system runs on a single developer machine.
  Multi-machine synchronization is out of scope; multiple concurrent
  agent sessions on the same machine are in scope.
- **MVP scoring**: The initial release uses text-based relevance
  scoring (locality, recency, tags, pins). Semantic/embedding-based
  scoring is a planned enhancement beyond MVP.
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
