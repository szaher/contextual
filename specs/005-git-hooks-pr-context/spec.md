# Feature Specification: Git Hooks PR Context & Embedded UI

**Feature Branch**: `005-git-hooks-pr-context`
**Created**: 2026-03-15
**Status**: Draft
**Input**: User description: "Enable ctxkit to add git hook per repo either manually via ctxkit cli or coding agent claude code plugin to add and use githooks to inject PR context as text in the commit message instead of dedicated file. This will keep changes made via ctxkit always available in git history. Enable ctxkit ui to visualize those in the ui. We can also, embed the ui into the cli and make it work with the daemon and/or cli?"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Install Git Hooks via CLI (Priority: P1)

A developer working on a project wants to automatically capture context metadata in every commit message. They run a single CLI command to install a git hook in their repository. From that point on, every commit they make automatically includes structured context information (active session, changed .ctx files, relevant context entries) appended to the commit message. This context is permanently preserved in git history and visible to all team members.

**Why this priority**: This is the foundational capability. Without git hook installation, no context can be embedded in commits. It delivers immediate value by making context changes permanently auditable in git history without any additional files or services.

**Independent Test**: Can be fully tested by running the install command in a test repo, making a commit, and verifying the commit message contains structured context metadata.

**Acceptance Scenarios**:

1. **Given** a git repository with ctxkit initialized, **When** the developer runs the hook installation command, **Then** a git hook is installed in `.git/hooks/` that will inject context into future commit messages.
2. **Given** a repository with the ctxkit git hook installed, **When** the developer makes a commit, **Then** the commit message is appended with minimal git trailers: session ID, changed .ctx file paths, context entry count, and timestamp.
3. **Given** a repository with the hook installed, **When** the developer makes a commit with no active ctxkit session or no .ctx changes, **Then** the commit message is left unchanged (no empty context block added).
4. **Given** a repository that already has a ctxkit git hook installed, **When** the developer runs the install command again, **Then** the system updates the hook without duplicating it and informs the user it was updated.

---

### User Story 2 - Automatic Hook Installation via Claude Code Plugin (Priority: P2)

An AI coding agent (Claude Code) begins a session in a repository. The Claude Code plugin automatically checks whether the ctxkit git hook is installed. If not, it offers to install it (or auto-installs based on policy). During the session, every commit the agent makes includes context metadata describing what the agent did, which context entries it used, and what .ctx changes it proposed — all embedded directly in the commit message.

**Why this priority**: Agents produce the most context-rich commits but are least likely to manually install hooks. Automatic installation ensures agent work is always traceable in git history without developer intervention.

**Independent Test**: Can be tested by starting a Claude Code session in a repo without the hook, verifying the plugin installs it, then making a commit and confirming context is injected.

**Acceptance Scenarios**:

1. **Given** a repository without a ctxkit git hook and an active Claude Code session, **When** the session starts, **Then** the plugin checks for the hook and installs it automatically (or prompts based on policy).
2. **Given** a repository with the hook installed and an active agent session, **When** the agent commits code, **Then** the commit message includes minimal git trailers: session ID, changed .ctx file paths, context entry count, and timestamp (matching the standard trailer format from FR-003).
3. **Given** a repository where the user has declined hook installation, **When** the plugin checks again in a future session, **Then** it respects the user's preference and does not re-prompt within the same project.

---

### User Story 3 - View Commit Context in the Dashboard UI (Priority: P2)

A team lead wants to understand what context an AI agent used when making changes last week. They open the ctxkit dashboard and navigate to a commit history view. The dashboard parses context metadata from commit messages and displays it in a structured, browsable format — showing which sessions produced which commits, what context was injected, and what .ctx files were modified.

**Why this priority**: Visualization makes the embedded context actionable. Without it, the structured trailers in commit messages are useful but hard to navigate across many commits. The dashboard provides the aggregate view.

**Independent Test**: Can be tested by populating a repo with commits containing context trailers, then opening the dashboard and verifying it correctly parses and displays the context data.

**Acceptance Scenarios**:

1. **Given** a repository with commits containing ctxkit context trailers, **When** the user opens the dashboard commit history view, **Then** they see a timeline of commits with parsed context metadata displayed in a structured format.
2. **Given** the dashboard showing commit history, **When** the user clicks on a specific commit, **Then** they see the full context details: session ID, context entries used, .ctx files changed, and agent actions taken.
3. **Given** a repository with a mix of commits with and without context trailers, **When** the dashboard displays commit history, **Then** commits without context are shown normally and commits with context are highlighted with an indicator.

---

### User Story 4 - Serve Dashboard from CLI (Priority: P3)

A developer wants to inspect context history but doesn't want to set up the daemon separately. They run a single CLI command that starts a local web server serving the dashboard UI. The dashboard connects to either the running daemon (if available) or reads directly from git history and local .ctx files to populate its views.

**Why this priority**: Embedding the UI into the CLI removes a setup barrier. Developers can inspect context with a single command instead of managing a separate daemon process. This makes the tool more accessible for individual contributors.

**Independent Test**: Can be tested by running the CLI dashboard command in a repo, opening the provided URL in a browser, and verifying the dashboard loads with commit context data.

**Acceptance Scenarios**:

1. **Given** a repository with ctxkit initialized, **When** the developer runs the dashboard command via CLI, **Then** a local web server starts and opens the dashboard UI in the default browser.
2. **Given** the CLI-served dashboard is running and a daemon is also running, **When** the dashboard loads, **Then** it connects to the daemon for real-time session data in addition to git history data.
3. **Given** the CLI-served dashboard is running with no daemon, **When** the dashboard loads, **Then** it reads context data directly from git commit history and local .ctx files, displaying available information.

---

### User Story 5 - Remove Git Hooks (Priority: P3)

A developer decides they no longer want context injected into commit messages. They run a CLI command to uninstall the ctxkit git hook. Future commits are no longer modified. Historical commits retain their context trailers.

**Why this priority**: Users must be able to cleanly remove the hook. This is essential for trust — users won't install hooks if they can't easily remove them.

**Independent Test**: Can be tested by installing the hook, verifying it works, then uninstalling it and verifying commits are no longer modified.

**Acceptance Scenarios**:

1. **Given** a repository with the ctxkit git hook installed, **When** the developer runs the uninstall command, **Then** the hook is removed from `.git/hooks/` and future commits are unmodified.
2. **Given** a repository where the ctxkit hook coexists with other hooks, **When** the developer uninstalls the ctxkit hook, **Then** only the ctxkit portion is removed and other hooks continue to function.

---

### Edge Cases

- What happens when the developer uses `--no-verify` flag on commits? The hook is skipped entirely and no context is injected — this is expected behavior.
- What happens when the `.git/hooks/` directory already contains a `prepare-commit-msg` hook from another tool? The system must detect the existing hook and either chain with it (appending ctxkit logic) or warn the user rather than overwriting.
- What happens when there is no active daemon and the hook runs? The hook should gracefully degrade — inject whatever context is available locally (changed .ctx files, git status) without requiring the daemon.
- What happens when commits are made in a detached HEAD state or during a rebase? The hook should still inject context when possible, but skip injection if the commit is non-interactive (e.g., rebase pick/squash).
- What happens when the commit message is very long and adding context would exceed platform limits (e.g., GitHub's soft limit)? The context trailer should be truncated with a reference to the full context via session ID.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a CLI command to install a git `prepare-commit-msg` hook in the current repository.
- **FR-002**: System MUST provide a CLI command to uninstall the ctxkit git hook without affecting other hooks in the same file.
- **FR-003**: The git hook MUST append a minimal set of git trailers to commit messages: session ID (if active), changed .ctx file paths, context entry count, and timestamp. Full session detail is available via session ID lookup in the daemon or dashboard.
- **FR-004**: The context trailer MUST use standard git trailer format (`Key: value` pairs after a blank line separator), parseable by native `git log --format=%(trailers)` and compatible with GitHub, GitLab, and CI/CD tooling. Trailer keys MUST use the `Ctxkit-` prefix (e.g., `Ctxkit-Session`, `Ctxkit-Files`, `Ctxkit-Entries`, `Ctxkit-Timestamp`).
- **FR-005**: The git hook MUST be a no-op when there is no active ctxkit session and no .ctx files are staged, to avoid polluting unrelated commits.
- **FR-006**: The git hook MUST apply the existing secret redaction engine to all trailer values before writing them to the commit message, preventing accidental leakage of sensitive data (API keys, connection strings, tokens).
- **FR-007**: The git hook MUST complete execution within 500ms. If the daemon is unreachable, the hook MUST skip daemon data after a 200ms timeout and fall back to locally available context information.
- **FR-008**: System MUST detect existing `prepare-commit-msg` hooks and chain with them rather than overwriting.
- **FR-009**: The Claude Code plugin MUST check for the ctxkit git hook at session start and install it automatically based on configurable policy (auto-install, prompt, or skip).
- **FR-010**: The dashboard UI MUST display a commit history view that parses context trailers from git log and presents them in a structured, browsable format.
- **FR-011**: The dashboard commit view MUST support filtering commits by session ID, by presence of context trailers, and by date range.
- **FR-012**: The CLI MUST provide a command to serve the dashboard UI as a local web server, optionally connecting to the daemon if running.
- **FR-013**: The CLI-served dashboard MUST be able to read context data from git history when no daemon is available.
- **FR-014**: System MUST provide a command to check the current hook installation status (installed, outdated, not installed).

### Key Entities

- **Context Trailer**: Standard git trailers appended to commit messages using the `Ctxkit-` prefix (e.g., `Ctxkit-Session: sess_abc123`, `Ctxkit-Files: src/.ctx, lib/.ctx`). Parseable by native `git log --format=%(trailers)` and dashboard tooling.
- **Hook Policy**: A per-repository or global configuration that determines how the Claude Code plugin handles hook installation (auto, prompt, skip).
- **Commit Context Record**: A parsed representation of a context trailer, used by the dashboard to display commit-level context history.

## Clarifications

### Session 2026-03-15

- Q: What format should context trailers use — fenced block, standard git trailers, or hybrid? → A: Standard git trailers with `Ctxkit-` prefix, parseable by native `git log --format=%(trailers)`.
- Q: Should the hook redact sensitive data from trailer values before embedding in commit messages? → A: Always redact using the existing secret redaction engine.
- Q: How much detail should context trailers contain — verbose, minimal, or configurable? → A: Fixed minimal (session ID, .ctx file paths, entry count, timestamp). Full detail via session lookup.
- Q: Should there be a performance constraint on hook execution? → A: Must complete within 500ms; daemon-unreachable fallback after 200ms timeout.

## Assumptions

- Git hooks are a well-understood mechanism and developers are comfortable with tools that install them, provided there is a clear uninstall path.
- The `prepare-commit-msg` hook is the appropriate hook type, as it runs before the user sees the commit message in their editor, allowing them to review and edit the injected context.
- Context trailers use standard git trailer format (`Ctxkit-Key: value` pairs after a blank line), parseable by native git tooling (`git log --format=%(trailers)`) and compatible with GitHub/GitLab trailer rendering.
- The dashboard is already built as a React application (`@ctxkit/ui`); the new commit history view extends it with an additional page/route.
- The CLI has a `dashboard` command stub; embedding the UI server requires implementing the full dashboard serving capability in a new `dashboard-cmd.ts` file.
- The hook should work on all platforms (macOS, Linux, Windows via Git Bash/WSL) since git hooks are shell scripts.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developers can install the git hook in under 10 seconds with a single command and verify it is working on the next commit.
- **SC-002**: 100% of commits made during an active ctxkit session automatically include a parseable context trailer without developer intervention.
- **SC-003**: The dashboard commit history view displays all context-enriched commits within 2 seconds of loading for repositories with up to 10,000 commits.
- **SC-004**: The CLI-served dashboard starts and is accessible in a browser within 3 seconds of running the command.
- **SC-005**: Hook installation and uninstallation do not break any existing git hooks or workflows in the repository.
- **SC-006**: Context trailers are parseable with 100% accuracy — every trailer written by the hook can be extracted and displayed by the dashboard without data loss.
- **SC-007**: The git hook adds no more than 500ms to commit time, with daemon-unreachable fallback completing within 200ms.
