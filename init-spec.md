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
