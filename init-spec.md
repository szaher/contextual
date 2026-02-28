You are Claude Code acting as a staff engineer + product engineer. Design and build a local “Context & Memory Manager” for coding agents that (1) remembers important info, (2) manages context efficiently, and (3) injects the most relevant context into each user request or tool/API call.

High-level concept
- Each directory can contain a human-readable “.ctx” file that acts as an index/memory for that directory.
- For speed/token savings: default behavior uses .ctx files + a small amount of recent session memory.
- For deeper analysis: the agent can bypass .ctx and read the directory/files directly (with clear heuristics for when).
- Provide a minimal “skills” layer + a local frontend to:
  - view currently running agent sessions on the machine
  - inspect what memory/context was injected per request/call
  - edit/approve memory (.ctx) changes
  - see diffs/audit logs

If anything essential is ambiguous, ask up to 7 clarifying questions, then proceed with reasonable defaults and clearly state assumptions.

--------------------------------------------------------------------
PRIMARY OUTPUTS (what you must produce)
1) Product + Architecture Spec (markdown)
   - goals / non-goals
   - constraints (local-first, fast, token efficient, human-editable)
   - core concepts: memory tiers, .ctx files, session memory, injection pack
   - threat model & privacy (secrets handling, redaction, opt-in logging)

2) Data formats
   - A concrete .ctx schema (YAML or Markdown-with-frontmatter; choose one)
   - Include examples for:
     - repo root .ctx
     - feature directory .ctx
     - file-specific “notes” entries (without needing a separate file)
   - Define versioning + migration strategy
   - Define a “lock/pin” mechanism so users can prevent auto-edits for specific entries

3) Context selection & injection algorithm
   - Input: (request text, working directory, touched files if known, current session state, token budget)
   - Output: “Context Pack” to inject + “Why included” explanations + “What was omitted” list
   - Must support:
     - hierarchical loading (cwd -> parents -> repo root; plus optionally linked ctx)
     - relevance scoring (semantic similarity + locality + recency + explicit tags/pins)
     - deterministic ordering to reduce prompt churn
     - token budgeting + compression rules (summaries first, details on-demand)
   - Include heuristics for when to “skip .ctx and read the directory directly”
     (e.g., low confidence, missing symbols, failing tests, stale ctx, conflicting notes)

4) Memory update pipeline
   - When to propose updates to .ctx (after task completion, after discovering new conventions, after bugfix, etc.)
   - How to generate updates safely:
     - propose change -> show diff -> user approve/edit -> write
     - auto-prune stale entries with user-visible justification
   - Drift detection:
     - detect when ctx is out of sync with repo (git diff, file moves, deleted APIs)
   - Concurrency/locking:
     - multiple sessions updating same .ctx
     - atomic writes + merge strategy

5) Local session tracking + frontend UI
   - Sessions list (active/recent), per-session timeline of requests/tool calls
   - For each request/call: show injected context, token estimate, source paths, and “reason codes”
   - Editing workflow:
     - edit ctx in UI, preview diff, apply
     - optional “approve future auto-updates in this area” toggle
   - Audit log:
     - who/what updated memory, when, why, and diff
   - UX constraints:
     - must work locally on a developer machine
     - minimal friction to inspect and edit

6) Implementation plan + deliverable code (MVP → v1)
   - Provide a step-by-step plan and then implement the MVP in-repo.
   - Include integration/e2e tests (focus on meaningful system tests, not unit-test-first).
   - Provide a runnable local demo:
     - start daemon
     - start UI
     - run a sample “agent request” that produces an injection pack + ctx update proposal

--------------------------------------------------------------------
RECOMMENDED MVP ARCHITECTURE (you may adjust, but justify)
- Core library (context-engine)
  - loads/merges ctx
  - scores relevance
  - builds Context Pack
  - proposes ctx diffs
- Local daemon (session + injection broker)
  - receives “request events” from agents (stdin wrapper, http, or socket)
  - records events, context packs, decisions
  - exposes local API for UI
- CLI
  - init ctx in repo
  - validate ctx schema
  - show “what would be injected” for a request
  - apply/propose ctx updates
- UI (local web app)
  - sessions list + per-request inspection
  - ctx editor + diff viewer

Stack suggestion (choose and commit):
- TypeScript/Node for daemon + core library + CLI
- UI: React (Vite) + simple component library
- Storage: local sqlite (sessions/events) + filesystem (.ctx)
- Optional: embeddings (pluggable). MVP can be lexical + heuristic scoring; v1 can add embeddings.

--------------------------------------------------------------------
.ctx CONTENT REQUIREMENTS (must be explicit)
Your .ctx format must support:
- Summary: 5–15 lines max “what matters”
- Key files (path -> purpose)
- Contracts/interfaces (APIs, schemas, invariants)
- Decisions (ADRs-lite: decision, rationale, date, alternatives)
- Commands (how to run/test/build)
- Gotchas (sharp edges, known issues)
- Tags for retrieval (e.g., auth, db, api, build, infra)
- Confidence/staleness metadata per entry (last verified commit hash or timestamp)
- Links to deeper sources (files, docs, line ranges) without copying large text

Also define:
- repo root vs directory .ctx precedence/merge rules
- how to avoid duplicating the same info across many directories (linking/refs)

--------------------------------------------------------------------
CONTEXT PACK FORMAT (what gets injected)
Define a structured injection blob, e.g.:
- “Context Pack v1”
  - Purpose
  - Relevant memories (bullet list with source path + reason)
  - Local conventions
  - Active decisions/invariants
  - Constraints (token budget, do-not-touch areas)
  - Open questions / missing info (if any)
  - Pointers for deep dive (files to open first)

Must include “reason codes” per item (e.g., LOCALITY_HIGH, TAG_MATCH, RECENT_EDIT, PINNED, SEMANTIC_TOPK).

--------------------------------------------------------------------
SECURITY / PRIVACY
- Never store raw secrets in .ctx.
- Redact tokens/keys if detected.
- Provide a mechanism to mark paths as “never read” and “never log”.
- Logs should be local-only by default; exporting must be explicit.

--------------------------------------------------------------------
EVALUATION (how you will prove it works)
Create 3 realistic scenarios and run them end-to-end:
1) Small repo with root .ctx only: verify injection selects correct subset for a request.
2) Nested directories each with .ctx: verify hierarchical merge + scoring picks the right items.
3) Drift: change code so ctx is stale, verify drift detection + update proposal + UI approval flow.

Include measurable acceptance criteria:
- injection pack determinism (same input -> same ordering)
- token budget respected
- ctx updates produce minimal diffs
- user can see/edit exactly what was injected

--------------------------------------------------------------------
DELIVERY RULES
- Produce the spec docs first, then implement.
- Prefer integration/e2e tests over many unit tests.
- Keep MVP small but complete (daemon + CLI + UI + core + demo).
- Every major design choice must include: alternatives considered + why rejected.
- Where you make assumptions, list them explicitly and proceed.

Start by asking clarifying questions (max 7) ONLY if you cannot proceed responsibly. Otherwise: state assumptions and begin with the spec.


# Game-changer features for v1 (10–15)

## 1) Deterministic Context Pack Builder (token-budgeted)
**Description**
A core engine that produces a structured “Context Pack” for every agent request/tool call. It loads `.ctx` hierarchically (cwd → parents → repo root), ranks items by relevance, applies a strict token/size budget, and outputs a stable ordering plus “why included” reason codes and “omitted” candidates.

**Relations / how it works with others**
- Feeds **Feature 2 (Explainability Panel)** with reason codes + omission lists.
- Uses **Feature 5 (Drift Detection)** staleness signals to down-rank stale entries.
- Constrained by **Feature 6 (Secret Redaction/Policies)** before injection.
- Logged by **Feature 8 (Session Timeline & Audit)** for replay/debug.

**Value proposition**
Massive reduction in wasted tokens and “prompt churn” while increasing correctness and reproducibility (“same input → same context → same behavior”).

---

## 2) Context Explainability & Diff View (“Why this?”)
**Description**
For each request/call, show exactly what was injected: snippets/summaries, source paths, confidence/staleness, token estimate, and reason codes (LOCALITY_HIGH, TAG_MATCH, PINNED, RECENT_EDIT…). Also show what was considered but omitted and why (budget, low score, blocked).

**Relations / how it works with others**
- Displays output from **Feature 1 (Context Pack Builder)**.
- Powers UI workflows in **Feature 10 (Local UI)** and CLI in **Feature 9**.
- Helps evaluate **Feature 12 (E2E Scenarios & Replay)** by explaining changes.

**Value proposition**
Turns “magic prompt stuffing” into an inspectable system users can trust, debug, and tune.

---

## 3) Repo-Native Memory: Hierarchical `.ctx` with Linking/Refs
**Description**
A `.ctx` format (YAML or Markdown frontmatter) that supports: summary, key files, decisions, commands, gotchas, interfaces/contracts, tags, staleness metadata, and links to deeper sources. Includes linking to avoid duplication across directories (e.g., `refs:` to shared ctx blocks).

**Relations / how it works with others**
- Primary memory substrate for **Feature 1 (Pack Builder)**.
- Updated safely by **Feature 4 (Memory Proposals)**.
- Protected by **Feature 7 (Locks/Pins)** and **Feature 6 (Policies)**.

**Value proposition**
Repo becomes self-indexing for agents—fast onboarding and fewer repeated “where is X?” questions.

---

## 4) Safe Memory Updates: Propose → Diff → Approve → Write
**Description**
When the agent learns something valuable (new command, convention, decision), it generates a minimal `.ctx` patch as a proposal. User can edit in UI/CLI, approve, then apply. No silent rewrites. Includes auto-suggestions for pruning duplicates and improving clarity.

**Relations / how it works with others**
- Writes into **Feature 3 (.ctx memory)**.
- Uses **Feature 2 (Explainability)** to justify proposed changes (“learned from file X / commit Y”).
- Gatekept by **Feature 7 (Locks/Pins)** and **Feature 6 (Secret Redaction)**.
- Recorded by **Feature 8 (Audit Log)**.

**Value proposition**
Turns ephemeral agent discoveries into durable, curated project memory without losing human control.

---

## 5) Drift & Staleness Detection (Git-aware)
**Description**
Detect when `.ctx` is out of date due to code changes: renamed files, deleted APIs, changed commands, or large diffs since last verified commit. Surface warnings and propose updates (“entry refers to src/foo.ts which moved to src/bar.ts”).

**Relations / how it works with others**
- Signals feed into **Feature 1** ranking/down-weighting stale memories.
- Triggers **Feature 4** proposals to update or prune.
- Visualized in **Feature 10 (UI)** with “stale badges”.

**Value proposition**
Prevents the #1 failure mode of agent memory: confidently injecting wrong or outdated context.

---

## 6) Privacy & Policy Engine (never-read / never-log / redaction)
**Description**
User-defined policies to prevent reading/logging certain paths (e.g., `.env`, `secrets/`, `~/.ssh`), plus secret detection/redaction before persisting anything into logs or `.ctx`. Includes “denylist wins” semantics.

**Relations / how it works with others**
- Applied before **Feature 1** injection and before **Feature 8** logging.
- Blocks unsafe proposals in **Feature 4**.
- Enforced across CLI/daemon/UI (**Features 9–10**).

**Value proposition**
Makes the product safe for real-world repos and enterprise environments (and reduces fear of using it).

---

## 7) Pin/Lock & Ownership Controls (anti-autopilot)
**Description**
Users can pin critical memory items (always include), lock blocks (never auto-edit), and assign “ownership” tags (e.g., security-owned decisions). Also supports “do-not-touch” zones and “review required” modes.

**Relations / how it works with others**
- Influences **Feature 1** selection and ordering (PINNED overrides).
- Prevents auto edits from **Feature 4** without explicit approval.
- Shown in **Feature 10 UI** with clear status and permissions.

**Value proposition**
Gives teams confidence that agents won’t mutate important project contracts or policy text.

---

## 8) Session Timeline + Audit Log (replayable)
**Description**
A local event store (e.g., sqlite) recording each agent request, tool call, injected Context Pack, decisions (skip `.ctx` / deep read), proposed `.ctx` diffs, and approvals. Includes filtering by repo/session/branch.

**Relations / how it works with others**
- Stores outputs from **Features 1–5** and decisions from **Feature 11**.
- Powers **Feature 12 (Replay / Regression)** and **Feature 10 UI**.

**Value proposition**
Turns debugging from “why did the agent do that?” into a deterministic, inspectable timeline.

---

## 9) Agent Integration Wrapper (CLI + SDK hooks)
**Description**
Drop-in integration that intercepts agent prompts/tool calls to request a Context Pack from the daemon. Supports:
- CLI wrapper mode (`ctxkit run -- <agent>`)
- Local HTTP/socket API for IDE plugins / custom agents
- Configurable budgets and modes per agent

**Relations / how it works with others**
- Calls **Feature 1** to get packs and **Feature 8** to log events.
- Respects **Feature 6** policy and **Feature 7** pins/locks.
- Enables **Feature 10 UI** to show real sessions.

**Value proposition**
Makes adoption easy: plug it into existing workflows without rewriting agents.

---

## 10) Local Frontend UI (inspect, edit, approve)
**Description**
A lightweight local web app that shows:
- Active/recent sessions on this machine
- Per-request injected context + reasons + token estimates
- `.ctx` explorer/editor with diff preview
- Staleness/drift warnings and approve/apply flows
- Search across memories and sessions

**Relations / how it works with others**
- UI for **Features 2, 4, 5, 7, 8**.
- Uses daemon APIs exposed by **Feature 9** integration layer.

**Value proposition**
Transforms memory management from “edit files blindly” to a first-class, user-friendly workflow.

---

## 11) Confidence-Gated “Deep Read” Trigger (auto escalations)
**Description**
Heuristics that decide when to bypass `.ctx` and read real files: low confidence, missing symbols, failing tests, conflicts, stale entries, or user intent (“refactor”, “debug failing test”). Produces a rationale and the minimal set of files to open first.

**Relations / how it works with others**
- Runs alongside **Feature 1** as a fallback policy.
- Logs decisions in **Feature 8** and displays in **Feature 2**.
- Informed by **Feature 5** drift signals.

**Value proposition**
Avoids the two extremes: “always read everything” (slow/expensive) vs “trust memory blindly” (wrong). This is the sweet spot.

---

## 12) Replay & Regression Harness (E2E test runner for context)
**Description**
A tool that replays recorded sessions (or scripted scenarios) against a fixed repo snapshot to verify:
- determinism of context packs
- token budget adherence
- stable reason codes
- expected drift warnings and proposal diffs

**Relations / how it works with others**
- Replays data from **Feature 8**.
- Validates outputs of **Features 1, 5, 11**.
- Supports the product’s integration-first constitution.

**Value proposition**
Lets teams “lock in” behavior and prevent regressions—huge for trust and long-term adoption.

---

## 13) Semantic + Lexical Retrieval Modes (pluggable)
**Description**
MVP uses lexical + heuristics (paths/tags/recency). v1 adds optional embeddings (local or provider) behind a plug-in interface. Supports hybrid ranking, caching, and offline mode.

**Relations / how it works with others**
- Enhances ranking in **Feature 1**.
- Affects explainability in **Feature 2** (“SEMANTIC_TOPK”).
- Must respect **Feature 6** policies for what gets embedded.

**Value proposition**
Better relevance with fewer tokens, especially in large repos—without forcing an online dependency.

---

## 14) Cross-Repo / Workspace Profiles (multi-project sanity)
**Description**
Profiles that store per-repo settings: budgets, allowed modes, ignore rules, default pinned items, and preferred agents. Also supports “workspace-level ctx” (like `~/.ctx/global.ctx`) for consistent personal conventions.

**Relations / how it works with others**
- Configures **Feature 1** budgets and **Feature 6** policies.
- UI surfaces profiles in **Feature 10** and logs them in **Feature 8**.

**Value proposition**
Makes the tool feel polished and scalable for devs juggling many repos and teams.

---

## 15) Context “Contracts” & Guardrails (must-include invariants)
**Description**
Define invariants/constraints that must be injected for certain areas (e.g., security constraints, API compatibility rules). If a request touches certain paths/tags, the pack must include the relevant contract block and warnings.

**Relations / how it works with others**
- Stored in **Feature 3** and pinned/locked via **Feature 7**.
- Enforced by **Feature 1** selection rules and visible via **Feature 2**.
- Validated via **Feature 12** replay tests.

**Value proposition**
Prevents “agent-caused incidents” by ensuring critical guardrails are always present when needed.
