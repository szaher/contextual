# Feature Specification: ctxl v2 — Index, Versioning, Conflicts, and Ecosystem

**Feature Branch**: `004-ctxl-v2`
**Created**: 2026-03-15
**Status**: Draft
**Input**: User description: ctxl v2 implementation design document covering .ctxl index, .ctx versioning, multi-agent conflict resolution, spec-kit integration bridge, /ctx skill, PR context generation, bootstrapping engine, and dashboard extensions.

## Clarifications

### Session 2026-03-15

- Q: Should the existing `version` field be repurposed as a content revision counter, or should a new field track content revisions? → A: Repurpose the `version` field to a content revision counter (1, 2, 3...). Existing v1 .ctx files with `version: 1` are naturally at content revision 1, so no file content changes. The schema changes from a fixed literal to an incrementing integer.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — .ctxl Index & Context Selection (Priority: P1)

An AI agent starting a new coding session needs to quickly determine which .ctx files are relevant to the current task. Today, the system walks the entire directory tree to discover and score .ctx files. With the .ctxl index, the system reads a single file that inventories all .ctx files in the repository — including summaries, tags, checksums, dependency relationships, and token estimates — then scores and selects the most relevant files within a configurable token budget before injecting them as context.

A developer or agent can generate or regenerate the .ctxl index at any time. The index also stores configurable scoring weights and budget allocations so that different projects can tune context selection behavior.

**Why this priority**: The index is the foundational data structure that every other v2 feature depends on — versioning, conflict tracking, bootstrapping, and the /ctx skill all read from or update the index. Without it, no v2 feature can function. It also delivers an immediate performance win: O(1) index read + O(k) selected reads replaces O(n) directory walks.

**Independent Test**: Can be tested by generating a .ctxl index from an existing multi-.ctx repository, then verifying the selector algorithm picks the most relevant files for a given prompt, cwd, and budget — and that the SessionStart hook reads the index instead of walking the directory tree.

**Acceptance Scenarios**:

1. **Given** a repository with 10+ .ctx files and no .ctxl index, **When** the user runs the index generation command, **Then** a .ctxl file is created at the repository root containing an entry for every .ctx file with correct paths, checksums, tags, token estimates, and a dependency graph.
2. **Given** a valid .ctxl index, **When** an agent starts a session with a prompt mentioning "authentication" from the `src/auth/` directory, **Then** the selector returns the .ctx files most relevant to authentication — ranked by locality (ancestor and same-directory files score highest), tag match, and recency — within the configured token budget.
3. **Given** a .ctxl index with budget allocations (contracts, local_ctx, related_ctx, history), **When** the selector runs, **Then** contracts in scope are always included first, followed by cwd ancestors, then highest-scored remaining files, without exceeding any category budget.
4. **Given** an existing .ctxl index and a single modified .ctx file, **When** the user runs an incremental index update, **Then** only the changed entry is recalculated (checksum, timestamp, token estimate) without re-scanning the entire repository.
5. **Given** a .ctxl index with dependency edges (e.g., api/.ctx depends on common/.ctx), **When** api/.ctx is selected, **Then** common/.ctx receives a dependency bonus in scoring.

---

### User Story 2 — .ctx Versioning & History (Priority: P2)

Every modification to a .ctx file is tracked with an inline version history. When a .ctx file is updated — whether by an agent, a developer, or an automated process — the system increments the version counter, records who made the change, when, and a brief diff summary (e.g., "+2 key_files, ~1 contract"). The most recent 20 history entries are stored directly in the .ctx file under a `_history` section; older entries overflow to a separate archive file that is also git-tracked.

Users and agents can view the full version history of any .ctx file, see what changed between versions, and understand how context evolved over time. The dashboard displays a chronological timeline of all .ctx changes across the repository.

**Why this priority**: Versioning enables conflict detection (US3) and is required for the auto-update protocol (US4). It also provides auditability — teams can understand how and why context evolved, which is essential for trust in AI-managed context.

**Independent Test**: Can be tested by performing multiple updates to a .ctx file and verifying that each update increments the version, creates a history entry with correct metadata, and that the history is queryable via CLI and dashboard.

**Acceptance Scenarios**:

1. **Given** a .ctx file at version 3, **When** the file is updated with a new key_file entry, **Then** the version increments to 4, and a new history entry is prepended to the `_history` array containing the version number, timestamp, author identifier, reason, checksum, and a diff summary like "+1 key_file".
2. **Given** a .ctx file with 20 history entries, **When** a 21st update occurs, **Then** the oldest entry is evicted from `_history` and appended to the archive file at `.ctxl.history/<path>/ctx-history.yaml`, keeping the inline history at exactly 20 entries.
3. **Given** a .ctx file with both inline history and archive entries, **When** the user requests full history, **Then** the system returns all entries merged chronologically from both sources.
4. **Given** two versions of a .ctx file, **When** the user requests a diff, **Then** the system produces a structured diff showing which sections changed and what entries were added, removed, or modified.
5. **Given** a repository with multiple .ctx files, **When** the user views the timeline in the dashboard, **Then** all version changes across all .ctx files are displayed chronologically with author, diff summary, and clickable links to view the full diff.

---

### User Story 3 — Multi-Agent Conflict Resolution (Priority: P3)

When two or more agents (or developers) concurrently modify the same .ctx file, the system detects the conflict automatically and performs a three-way merge. If the changes affect different sections or different entries within a section, the merge resolves cleanly. If both sides modify the same entry (e.g., the same contract), the system writes the file with conflict markers and surfaces the conflict for human or agent resolution.

A lock manager prevents write races: each .ctx write acquires a short-lived lock (default 5 minutes, with automatic expiry) to ensure atomic updates. If a lock is held by another agent, the writer retries with backoff.

**Why this priority**: Multi-agent workflows are increasingly common. Without conflict resolution, concurrent agents would silently overwrite each other's context, leading to data loss and inconsistent project memory.

**Independent Test**: Can be tested by simulating two agents that both read the same .ctx file, make different changes, and write back. Verify that the merge engine detects concurrent edits, applies clean merges where possible, and surfaces conflicts with both versions preserved for resolution.

**Acceptance Scenarios**:

1. **Given** two agents that both read a .ctx file at version 5 and make non-overlapping changes (one adds a key_file, the other adds a contract), **When** both attempt to write, **Then** the first write succeeds as version 6, and the second detects the version mismatch, performs a three-way merge, and writes version 7 containing both additions without data loss.
2. **Given** two agents that both modify the same contract entry with different content, **When** the merge engine runs, **Then** the resulting .ctx file contains the entry with `_conflict: true` and `_versions[]` preserving both agents' versions, and the .ctxl index marks `has_conflicts: true` for that file.
3. **Given** a .ctx file with unresolved conflicts, **When** a user or agent resolves a conflict by picking one version (or providing a manual merge), **Then** the conflict markers are removed, the version is bumped, and the .ctxl index is updated to reflect `has_conflicts: false`.
4. **Given** an agent attempting to write a .ctx file that is locked by another agent, **When** the lock TTL has not expired, **Then** the writer retries with backoff, and if the lock expires (stale process), the writer acquires it and proceeds.
5. **Given** additive sections like tags and gotchas, **When** both agents add different entries, **Then** the merge always succeeds without conflict (union for tags, concatenate for gotchas).

---

### User Story 4 — Auto-Update Protocol (Priority: P4)

During a coding session, when an agent modifies source files, the system automatically tracks which directories have been changed. When the agent completes a task, the system analyzes what changed (using git diff), generates .ctx update proposals for affected directories, and either auto-applies them (if policy allows) or queues them for human review.

The system records all context-related activity (selection, read, stale detection, proposal, update, conflict) in an activity feed that can be viewed in real time via the dashboard.

**Why this priority**: Auto-update is the core automation loop that keeps context fresh without developer intervention. Without it, .ctx files become stale after every coding session, defeating the purpose of distributed context memory.

**Independent Test**: Can be tested by simulating a coding session where files are edited, verifying that staleness is tracked per-directory, and that on task completion, .ctx update proposals are generated and either auto-applied or queued based on policy settings.

**Acceptance Scenarios**:

1. **Given** an agent editing a file in `src/auth/`, **When** the PostToolUse hook fires after an Edit tool call, **Then** the `src/auth/` directory is marked as "potentially stale" in the session's staleness tracker.
2. **Given** three directories marked as stale during a session, **When** the task completes, **Then** the system generates a .ctx update proposal for each stale directory, analyzing changed files and proposing additions/removals to key_files, contract updates, and new gotchas.
3. **Given** the project policy `auto_update: true` and a clean proposal (no conflicts), **When** the proposal is generated, **Then** it is automatically applied — the .ctx file is updated, version is bumped, and the .ctxl index is refreshed.
4. **Given** the project policy `require_review: true`, **When** a proposal is generated, **Then** it is queued in the dashboard for human review instead of being auto-applied.
5. **Given** an active session with context selection, stale marking, and auto-updates, **When** the user views the activity feed, **Then** all events (SELECT, READ, STALE, PROPOSE, UPDATE) are displayed chronologically with agent identity and relevant details.

---

### User Story 5 — Bootstrapping Engine (Priority: P5)

A developer onboarding a new repository (or a new directory within an existing repo) can run a bootstrap command that automatically analyzes the codebase and generates initial .ctx files. The analyzer detects the programming language, framework, entry points, test files, build commands, and inter-directory dependencies by examining file extensions, configuration files, and import statements.

In "quick" mode, bootstrapping uses heuristics only. In "full" mode, it can call an AI summarizer to produce richer descriptions. Generated .ctx files are presented as proposals for review before writing.

**Why this priority**: Bootstrapping dramatically lowers the barrier to adoption. Without it, developers must manually create .ctx files for every directory, which is tedious for large codebases and discourages adoption.

**Independent Test**: Can be tested by running the bootstrap command against a real codebase (e.g., a multi-directory project with package.json/Makefile files) and verifying that the generated .ctx files contain reasonable key_files, tags, commands, and dependency inferences.

**Acceptance Scenarios**:

1. **Given** a repository with 5 directories containing source code and no .ctx files, **When** the user runs the bootstrap command in quick mode, **Then** the system generates a .ctx file for each qualifying directory containing inferred summary, key_files (entry points, config files), tags (from directory name and file extensions), and commands (from package.json/Makefile).
2. **Given** the bootstrap command with `--dry-run`, **When** executed, **Then** the system shows what would be generated without writing any files.
3. **Given** directories that already have .ctx files, **When** bootstrap runs with `skip-existing` enabled, **Then** existing .ctx files are preserved and only new directories get generated files.
4. **Given** a directory with fewer files than the minimum threshold, **When** bootstrap runs, **Then** that directory is skipped with a reason logged.
5. **Given** bootstrap results, **When** the user approves the proposals, **Then** .ctx files are written, the .ctxl index is generated/updated, and all files are at version 1 with an initial history entry.

---

### User Story 6 — /ctx Skill (Priority: P6)

AI agents interacting via Claude Code can use a `/ctx` skill to manage distributed context memory through natural-language subcommands. The skill provides commands for viewing status, showing/editing .ctx files, adding/removing entries by section, injecting context packs, regenerating the index, bootstrapping new directories, viewing diffs, resolving conflicts, viewing history, validating consistency, and showing stale files.

The existing `/ctxkit` skill name continues to work as a backward-compatible alias.

**Why this priority**: The /ctx skill is the primary user interface for agents to interact with context memory during sessions. It ties together all v2 capabilities (index, versioning, conflicts, bootstrap) into an ergonomic command set.

**Independent Test**: Can be tested by invoking each /ctx subcommand and verifying it produces the correct output or side effect — e.g., `/ctx show` displays the current .ctx file, `/ctx add gotcha "..."` appends a gotcha entry and bumps the version.

**Acceptance Scenarios**:

1. **Given** a repository with .ctx files and a .ctxl index, **When** the agent invokes `/ctx` (no subcommand), **Then** the system displays a status overview showing total .ctx file count, stale count, conflict count, token budget usage, and last update time.
2. **Given** a .ctx file in the current directory, **When** the agent invokes `/ctx add key_file path=foo.ts purpose="Main handler" tags=http,api`, **Then** a new key_file entry is added to the .ctx file, the version is bumped, the .ctxl index is updated, and a confirmation with the diff is returned.
3. **Given** a .ctx file with unresolved conflicts, **When** the agent invokes `/ctx resolve`, **Then** the system walks through each conflict interactively, presenting both versions and resolution options (pick ours, pick theirs, manual merge, keep both).
4. **Given** a directory without a .ctx file, **When** the agent invokes `/ctx bootstrap`, **Then** the system analyzes the directory, generates a .ctx proposal, and presents it for approval.
5. **Given** the `/ctxkit` command, **When** invoked, **Then** it behaves identically to `/ctx` (backward-compatible alias).

---

### User Story 7 — Spec-Kit Integration Bridge (Priority: P7)

Teams using both spec-kit (specification-driven development) and ctxl (distributed context memory) can keep their artifacts synchronized. The bridge imports spec-kit constitutions, component specifications, and ADRs into .ctx files (decisions, contracts, gotchas), and exports .ctx content back to spec-kit markdown format.

The constitution is always the source of truth — its principles become locked decisions and contracts in the root .ctx that cannot be overridden by sync. Component specs and .ctx files are peers with timestamp-based conflict detection for bidirectional sync.

**Why this priority**: Spec-kit integration connects pre-coding intent (specifications) with runtime context (what agents see during sessions). Without the bridge, teams must manually duplicate information between both systems.

**Independent Test**: Can be tested by importing a constitution and component specs into .ctx files, verifying the mapping is correct (principles become locked decisions, requirements become contracts), then exporting back and verifying round-trip fidelity.

**Acceptance Scenarios**:

1. **Given** a spec-kit constitution with principles and technical boundaries, **When** the user runs the import command, **Then** principles become locked decisions (with CONST- prefix IDs) in the root .ctx, and technical boundaries become locked contracts — all marked as non-overridable.
2. **Given** spec-kit component specs with requirements and edge cases, **When** imported, **Then** requirements become contracts (with FR- prefix) in the corresponding directory's .ctx file, and edge cases become gotchas.
3. **Given** a .ctx file that is newer than the corresponding spec-kit artifact (by timestamp comparison), **When** bidirectional sync runs, **Then** the .ctx content is exported to update the spec file, preserving manually-edited sections.
4. **Given** both the spec and .ctx have been modified since last sync, **When** sync runs, **Then** the system flags a conflict for manual resolution rather than silently overwriting either side.
5. **Given** the validation command with a constitution path, **When** run, **Then** the system checks all .ctx files for compliance with constitutional principles and reports violations with references to the specific principle.

---

### User Story 8 — PR Context & Prompt History (Priority: P8)

After completing a coding task, an agent or developer can generate a PR context document that summarizes what happened during the session: the chain of prompts, which tools were used, what agent decisions were made (and why), which .ctx files informed the work, which files changed, and how .ctx files were updated. If spec-kit is available, the document cross-references requirement and ADR IDs.

The PR context document can be output as markdown (suitable for pasting into a GitHub PR description) or as JSON (for programmatic consumption). It can also be piped directly to `gh pr create` for one-command PR creation with full context.

**Why this priority**: PR context bridges the gap between agent sessions (what happened) and code review (why it happened). Reviewers see what changed in git but lack the narrative of the agent's reasoning, the context it relied on, and the decisions it made autonomously.

**Independent Test**: Can be tested by creating a session with known prompts and tool calls, then generating a PR context document and verifying it contains the correct prompt chain, agent decisions, context references, file changes, and stats.

**Acceptance Scenarios**:

1. **Given** a completed agent session with 4 prompts, 19 tool calls, and 3 changed files, **When** the user runs the PR context generation command, **Then** a markdown document is produced containing a summary, motivation, prompt chain table, agent decisions table, context references, file changes, .ctx updates, and session stats.
2. **Given** a git branch with multiple sessions, **When** PR context is generated with `--branch` flag, **Then** the system finds the merge-base with main, identifies all overlapping sessions, and produces a unified PR context document covering all sessions.
3. **Given** a session where the agent consulted a .ctx contract to guide its behavior, **When** PR context is generated, **Then** the agent decision entry references the specific .ctx file and section, classified as "context-driven".
4. **Given** spec-kit artifacts available in the repository, **When** PR context is generated with `--link-specs`, **Then** the document includes a spec references table mapping changes to requirement IDs (FR-xxx, NFR-xxx) and ADR IDs.
5. **Given** the `--gh` output flag, **When** the output is piped to `gh pr create --body-file -`, **Then** a GitHub PR is created with the full context document as the PR body.

---

### User Story 9 — Dashboard Extensions (Priority: P9)

The existing inspection dashboard is extended with new pages: a memory evolution timeline showing how .ctx files change over time, an interactive context map visualizing the dependency graph with health indicators, a conflict resolution UI for side-by-side comparison and resolution, a real-time activity feed showing agent interactions with context, and a PR context view per session.

**Why this priority**: The dashboard is the human oversight layer for all v2 features. While all core functionality is available via CLI and MCP tools, the dashboard provides visual understanding of context evolution, dependency relationships, and conflict state that is difficult to achieve in text-only interfaces.

**Independent Test**: Can be tested by populating a repository with versioned .ctx files, conflicts, and activity events, then loading each dashboard page and verifying it renders correctly with the expected data.

**Acceptance Scenarios**:

1. **Given** a repository with versioned .ctx files, **When** the user navigates to the timeline page, **Then** all version changes are displayed chronologically with author, diff summary, and clickable diff links, with filtering by path, author, and date range.
2. **Given** a .ctxl index with dependency edges, **When** the user navigates to the context map page, **Then** an interactive graph visualization displays .ctx files as nodes with dependency edges, color-coded freshness indicators (green/yellow/red), conflict warnings, and clickable nodes that expand to show sections.
3. **Given** unresolved conflicts, **When** the user navigates to the conflicts page, **Then** each conflict is displayed with side-by-side comparison of both versions, and resolution buttons (pick A, pick B, edit merged, keep both).
4. **Given** active agent sessions, **When** the user navigates to the activity feed, **Then** events stream in near-real-time showing selection, read, stale marking, proposals, and updates with full metadata.
5. **Given** a completed session with a generated PR context, **When** the user navigates to the session's PR context page, **Then** the rendered PR context markdown is displayed with copy-to-clipboard and open-in-GitHub actions.

---

### Edge Cases

- What happens when a .ctxl index references a .ctx file that has been deleted? The index marks it as removed during the next regeneration, and the selector skips it.
- What happens when two agents acquire locks on the same .ctx file simultaneously? The lock manager uses atomic file-level locking (proper-lockfile) to serialize access; the second agent retries with backoff until the lock is released or expires.
- What happens when a lock holder crashes without releasing the lock? Locks have a 5-minute TTL. After expiry, the lock is automatically cleaned up by the next lock acquisition attempt.
- What happens when a .ctx file has no `_history` section? It is treated as version 1 with no history (v1 backward compatibility). The next write initializes the history.
- What happens when the .ctxl index does not exist? The system falls back to the v1 directory-walk behavior for context discovery (zero breaking changes).
- What happens when bootstrap encounters a directory with only generated/vendor files? The directory is skipped if it matches ignore patterns (.gitignore, node_modules, vendor, dist, build).
- What happens when a spec-kit constitution changes after initial import? Re-running import updates the locked decisions and contracts in .ctx. Previously imported entries are updated in-place using their stable ID prefixes (CONST-, FR-).
- What happens when PR context generation finds no session data? It produces a graceful "no session data found" message rather than failing.
- What happens when the token budget is insufficient for even the most relevant .ctx files? The selector includes partial results (as many as fit) and returns the omitted entries with reasons, allowing the agent to request specific files manually.
- What happens when a three-way merge encounters entries added by both sides with the same identity key but different content? It creates a conflict marker preserving both versions for manual resolution.
- What happens when a v1 .ctx file with `version: 1` is read by v2? It is treated as content revision 1. The first v2 write increments it to 2 and initializes the `_history` array.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST generate a .ctxl index file at the repository root that inventories all .ctx files with their paths, summaries, tags, checksums, dependency relationships, and token estimates.
- **FR-002**: System MUST score and select .ctx files for a given task based on configurable weighted factors: locality to working directory, recency of last modification, tag match to prompt keywords, dependency relationships, and manual weight adjustments.
- **FR-003**: System MUST allocate selected .ctx files within a configurable token budget with separate categories for contracts, local context, related context, and history.
- **FR-004**: System MUST compute SHA-256 checksums of .ctx content (excluding the `_history` section) to detect modifications.
- **FR-005**: System MUST repurpose the existing `version` field in .ctx files as an incrementing content revision counter (1, 2, 3...) and maintain inline history (max 20 entries), recording the version number, timestamp, author, reason, checksum, and diff summary for every update. Existing v1 files with `version: 1` are naturally at content revision 1 and require no migration of this field.
- **FR-006**: System MUST archive history entries beyond the 20-entry limit to a separate file that is git-tracked.
- **FR-007**: System MUST produce structured diffs between .ctx file versions showing per-section changes (added, removed, modified entries).
- **FR-008**: System MUST implement file-level locking with configurable TTL (default 5 minutes) and automatic expiry for concurrent write protection.
- **FR-009**: System MUST perform three-way merge when concurrent modifications to the same .ctx file are detected, using section-appropriate strategies (union for additive sections, conflict markers for incompatible changes).
- **FR-010**: System MUST preserve both versions of conflicting entries with markers and provide resolution options: pick one side, manual merge, or keep both.
- **FR-011**: System MUST track which directories have been modified during agent sessions and generate .ctx update proposals for stale directories on task completion.
- **FR-012**: System MUST support both auto-apply and require-review policies for .ctx update proposals, configurable per project.
- **FR-013**: System MUST record all context-related activity (selection, read, stale detection, proposal, update, conflict, resolution) as events viewable in chronological order.
- **FR-014**: System MUST analyze directory contents (file types, configuration files, import statements, entry points) to generate initial .ctx files with inferred metadata.
- **FR-015**: System MUST present bootstrapped .ctx files as proposals for review before writing.
- **FR-016**: System MUST provide a skill-based interface (/ctx) with subcommands for status (default, no subcommand), show, edit, add, remove, inject, index, bootstrap, diff, resolve, history, validate, speckit, stale, and PR context operations.
- **FR-017**: System MUST maintain backward compatibility: the existing /ctxkit command MUST continue to work as an alias for /ctx.
- **FR-018**: System MUST import spec-kit constitutions as locked decisions and contracts in the root .ctx file, and component specifications as contracts and gotchas in directory-level .ctx files.
- **FR-019**: System MUST export .ctx content to spec-kit markdown format, preserving manually-edited sections in existing spec files.
- **FR-020**: System MUST support bidirectional sync between spec-kit artifacts and .ctx files with timestamp-based conflict detection.
- **FR-021**: System MUST validate .ctx files against spec-kit constitutional principles and report violations.
- **FR-022**: System MUST generate PR context documents from session data containing prompt chain, agent decisions, context references, file changes, .ctx updates, spec references, and session statistics.
- **FR-023**: System MUST link sessions to git commit ranges for PR context scoping.
- **FR-024**: System MUST support markdown and JSON output formats for PR context documents.
- **FR-025**: System MUST provide dashboard pages for timeline visualization, context map with dependency graph, conflict resolution, real-time activity feed, and PR context viewing.
- **FR-026**: System MUST maintain backward compatibility with v1: repositories without .ctxl files, _history, or locks MUST fall back to v1 behavior transparently. The `version` field changes from a fixed schema identifier to a content revision counter; existing v1 files (with `version: 1`) are valid as revision 1 with no file modification needed. Internal consumers MUST accept any positive integer for the `version` field.
- **FR-027**: System MUST provide a migration command that upgrades v1 repositories to v2 by initializing version counters, empty histories, checksums, and the .ctxl index — idempotent and non-destructive.
- **FR-028**: System MUST provide 6 new MCP tools (index generate, index select, ctx history, ctx write, ctx bootstrap, pr generate) in addition to the existing 10.
- **FR-029**: System MUST provide CLI commands for index management, history viewing, conflict resolution, bootstrapping, spec-kit operations, PR context generation, migration, and git hook initialization.
- **FR-030**: System MUST support configurable scoring weights (locality, recency, tag match, dependency bonus, contract floor) and budget allocations at the project level via the .ctxl file.

### Key Entities

- **.ctxl Index**: The central registry of all .ctx files in a repository. Contains entries with metadata (path, summary, tags, checksum, dependencies, token estimate), a dependency graph, scoring/budget configuration, and project policies.
- **.ctx History Entry**: A record of a single version change to a .ctx file. Contains version number, timestamp, author (agent or developer), session ID, reason, checksum, and diff summary.
- **Lock**: An ephemeral record of an exclusive write hold on a .ctx file. Contains the path, holder identity, acquisition time, expiry time, and operation type.
- **Conflict Entry**: A record of incompatible concurrent changes to the same entry within a .ctx file. Preserves both versions with author metadata for resolution.
- **Activity Event**: A record of a context-related action (selection, read, stale detection, proposal, update, conflict, resolution). Stored in the daemon database, not in git-tracked files.
- **PR Context**: A synthesized document combining session prompt chains, agent decisions, context references, file changes, and spec references into a reviewable narrative.
- **Mapping Rule**: A definition of how a spec-kit artifact section maps to a .ctx section, including transformation type, ID prefix, lock status, and directionality.

## Assumptions

- The existing v1 ctxl system is fully functional and stable as the foundation for v2 extensions.
- The .ctxl index file is small enough to read in a single operation (even for large repos with 100+ .ctx files).
- Lock TTL of 5 minutes is sufficient for the slowest agent operations; stale locks from crashed processes are safe to reclaim.
- 20 inline history entries provide sufficient recent history for most workflows; the archive file handles unbounded history.
- Spec-kit's file format (markdown with headings, bullet points, and tables) is stable enough to parse reliably.
- PR context generation from session data does not require real-time access to the original agent conversation — only the metadata stored in the daemon's session tables.
- The dashboard is used for oversight and occasional conflict resolution, not as the primary workflow tool (CLI and /ctx skill are primary).

## Scope

### In Scope

- .ctxl index system (schema, generator, selector, checksum, CLI, hook integration)
- .ctx versioning (history entries, version tracking, archive, diff engine)
- Multi-agent conflict resolution (lock manager, three-way merge, conflict markers, resolution workflow)
- Auto-update protocol (staleness tracking, hook extensions, activity events)
- Bootstrapping engine (code analyzer, .ctx generator)
- /ctx skill (all subcommands listed in design document)
- Spec-kit integration bridge (new @ctxkit/speckit-bridge package: import, export, validate, sync)
- PR context & prompt history (generator, renderer, session linker, CLI command, MCP tool)
- Dashboard extensions (timeline, context map, conflicts, activity feed, PR context view)
- Extended validation and enforcement (validator, git hooks)
- v1-to-v2 migration command
- 6 new MCP tools, 8+ new CLI commands
- Backward compatibility (zero breaking changes)

### Out of Scope

- Cross-repository references (deferred per D-013 in design document)
- Authentication or access control for daemon endpoints
- Auto-approve policies for conflict resolution (conflicts always require human or agent choice)
- Custom PR context templates (only default template in v2)
- Real-time collaborative editing of .ctx files (not Google-Docs-style concurrent editing)
- Spec-kit task import (tasks are workflow artifacts, not context)
- CI workflow templates (deferred; git hooks cover local enforcement)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Agent session startup reads the .ctxl index and selects relevant .ctx files in under 500ms for repositories with up to 100 .ctx files, compared to directory-walk discovery.
- **SC-002**: 100% of .ctx file modifications produce a version history entry with correct metadata (version, timestamp, author, diff summary).
- **SC-003**: Two concurrent agents modifying the same .ctx file result in zero data loss — all changes from both agents are preserved via clean merge or conflict markers.
- **SC-004**: Bootstrap generates at least one meaningful .ctx file (with key_files and tags) for 80% of qualifying directories in a typical multi-language repository.
- **SC-005**: All 15+ /ctx subcommands produce correct output or side effects when invoked by an agent during a session.
- **SC-006**: Spec-kit import correctly maps 90%+ of constitution principles to locked decisions and component requirements to contracts, verifiable by round-trip export comparison.
- **SC-007**: PR context documents generated from session data contain correct prompt chains, file changes, and stats, verifiable against the source session data.
- **SC-008**: All 5 new dashboard pages render correctly with test data and support their documented interactions (filtering, clicking, resolving).
- **SC-009**: Zero existing v1 tests break after v2 implementation — all 223+ integration tests and 84+ E2E tests continue to pass.
- **SC-010**: The v1-to-v2 migration command is idempotent: running it twice on the same repository produces identical results with no data loss.
