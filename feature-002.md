# CtxKit ↔ Agent Integration Spec (Claude Code + Codex)

This spec defines **two first-class adapters** (plus a shared MCP server) so users can run CtxKit **from inside** Claude Code and Codex, and also get **automatic context injection** with traceability.

---

## 1) Integration architecture (common)

### 1.1 Components
- **CtxKit Daemon (local)**  
  Owns sessions, event log, context-pack generation, proposals, and policy enforcement.
- **CtxKit CLI (`ctxkit`)**  
  Human + agent-friendly entrypoint (can be called from shells/tools).
- **CtxKit MCP Server (`ctxkit-mcp`)**  
  Exposes CtxKit capabilities as MCP tools (for both Claude Code and Codex). Claude Code and Codex both support MCP integrations. :contentReference[oaicite:0]{index=0}

### 1.2 Canonical tools (exposed via MCP + CLI)
Minimum tool surface:
- `ctxkit.context_pack` (build Context Pack for a prompt/tool intent)
- `ctxkit.log_event` (record tool calls + results)
- `ctxkit.propose_update` (generate `.ctx` diff proposal)
- `ctxkit.apply_proposal` / `ctxkit.reject_proposal`
- `ctxkit.sessions.list` / `ctxkit.sessions.show`
- `ctxkit.policy.get` / `ctxkit.policy.validate`
- `ctxkit.memory.search`

> MCP tools are the “cleanest” way to use CtxKit *inside* agents. CLI remains the universal fallback.

---

## 2) Claude Code Adapter (first-class)

Claude Code supports **hooks** (deterministic lifecycle automation), **skills** (invoke with `/skill-name`), and **MCP** tools. :contentReference[oaicite:1]{index=1}  
Claude Code also supports packaging these as a **plugin** (skills, agents, hooks, MCP servers, etc.). :contentReference[oaicite:2]{index=2}

### 2.1 Adapter package
**Name:** `ctxkit-claude-plugin`

**Contents (plugin components)**
1) **MCP server registration** for `ctxkit-mcp`  
2) **Hooks** to auto-inject context and log activity  
3) **Skill** for interactive/manual usage (`/ctxkit`)  
4) Optional: **Guardrail hooks** (policy enforcement, secret redaction reminders)

---

## 2.2 Claude Code: automatic injection via hooks (recommended)

Claude Code hook events include:
- `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`,
  `TaskCompleted`, `PreCompact`, `SessionEnd`, etc. :contentReference[oaicite:3]{index=3}

### Hook A — `SessionStart`: bootstrap session + env
**Goal:** ensure daemon is running, create a CtxKit session, and make it accessible to Claude Code tools.

**Mechanics**
- Hook runs at session start and can add `additionalContext`. :contentReference[oaicite:4]{index=4}
- Hook can persist env vars for subsequent Bash commands using `CLAUDE_ENV_FILE`. :contentReference[oaicite:5]{index=5}

**Actions**
- Start daemon if needed (`ctxkit daemon start` or equivalent).
- Create session (`ctxkit sessions new --json`) and store:
  - `CTXKIT_SESSION_ID`
  - `CTXKIT_API` (daemon endpoint)
  - `CTXKIT_REPO_ROOT`

**Outputs**
- Set env vars via `CLAUDE_ENV_FILE`
- Add short bootstrap context:
  - “CtxKit session active: <id>. Use /ctxkit for help.”

---

### Hook B — `UserPromptSubmit`: inject Context Pack into every user turn
**Goal:** prepend a Context Pack for each user prompt.

Claude Code explicitly supports adding context on `UserPromptSubmit`:
- Either **plain stdout** or JSON with `additionalContext`. :contentReference[oaicite:6]{index=6}

**Algorithm**
1) Read hook input JSON (includes `prompt`). :contentReference[oaicite:7]{index=7}
2) Call CtxKit:
   - `ctxkit context-pack --session $CTXKIT_SESSION_ID --cwd $CWD --request "$PROMPT" --mode turn --budget <configured>`
3) Return JSON:
   - `hookSpecificOutput.additionalContext = <inject_text>`
   - (optional) include a compact header with pack id + token estimate

**Guarantees**
- Deterministic ordering comes from CtxKit core (Feature 1).
- Every injection is logged (see Hook E/F).

---

### Hook C — `PreToolUse`: tool-level context (best quality)
**Goal:** add context tailored to the tool call (e.g., before Bash/Edit/Write/Read/Glob/Grep or MCP tools). :contentReference[oaicite:8]{index=8}

**Mechanics**
- `PreToolUse` hook input includes `tool_name` and `tool_input`. :contentReference[oaicite:9]{index=9}
- Hook output can include `additionalContext` and can also block/ask/allow. :contentReference[oaicite:10]{index=10}

**Actions**
1) Build a tool-intent object from `tool_name` + `tool_input`
2) Request:
   - `ctxkit context-pack --mode tool --tool-name ... --tool-input ...`
3) Return:
   - `additionalContext = <tool-specific inject_text>`
4) Optional enforcement:
   - deny dangerous commands based on CtxKit policy (or keep policy inside CtxKit and only inject warnings)

---

### Hook D — `PostToolUse` / `PostToolUseFailure`: log what happened
**Goal:** high-fidelity session timeline (what was read/written/run, exit codes, errors).

Claude Code provides post-tool hooks with `tool_input` and `tool_response` (or `error` on failure). :contentReference[oaicite:11]{index=11}

**Actions**
- Call `ctxkit log-event` with:
  - tool name, inputs, outputs, file paths, command, exit code
- (Optional) on failures, request a tiny “recovery context” pack.

---

### Hook E — `TaskCompleted`: propose memory updates
**Goal:** when Claude marks a task complete, CtxKit prepares `.ctx` diffs.

`TaskCompleted` can be blocked by exit code behavior and used to inject context. :contentReference[oaicite:12]{index=12}

**Actions**
- Trigger `ctxkit propose-update --session ... --scope cwd|repo`
- Emit `additionalContext` with:
  - proposal id
  - summary of changes
  - “Review via /ctxkit proposals”

---

### Hook F — `PreCompact`: preserve “memory spine” before compaction
**Goal:** when compaction occurs, ensure essential `.ctx` pointers survive.

Claude Code supports a `PreCompact` hook event. :contentReference[oaicite:13]{index=13}

**Actions**
- Ask CtxKit for a “Compaction Spine” (short re-injection content)
- Return as `additionalContext`

---

## 2.3 Claude Code: skill for manual control (`/ctxkit`)
Claude Code supports skills created via `SKILL.md` and invokable with `/skill-name`. :contentReference[oaicite:14]{index=14}

**Skill name:** `/ctxkit`

**Skill responsibilities**
- Provide “operator UI” inside chat:
  - `/ctxkit inject <text>` → show current Context Pack (and why)
  - `/ctxkit sessions` → list sessions
  - `/ctxkit memory search <q>`
  - `/ctxkit propose` → propose update
  - `/ctxkit apply <proposal_id>`
  - `/ctxkit policy` → show/validate policies

**Implementation note**
- The skill should prefer calling MCP tools (when available), and fallback to Bash calls like:
  - `ctxkit inject ... --json`
  - `ctxkit proposals apply ...`

---

## 3) Codex Adapter (first-class)

Codex supports:
- **MCP servers** (configurable via `codex mcp add ...`) and visible in the TUI via `/mcp`. :contentReference[oaicite:15]{index=15}
- **Local execution** (Codex CLI can run commands in the selected directory; local shell tool exists). :contentReference[oaicite:16]{index=16}
- **Repo-scoped instruction injection via `AGENTS.md`**, automatically enumerated from repo root → CWD and merged. :contentReference[oaicite:17]{index=17}

So Codex gets **two complementary adapters**:
1) MCP tool adapter (interactive, inspectable)
2) `AGENTS.md` adapter (zero-friction “always-on” behavior)

---

## 3.1 Codex MCP Adapter (recommended for “use ctxkit from within Codex”)

### 3.1.1 Setup contract
Users add the MCP server:
- `codex mcp add ctxkit -- <ctxkit-mcp command>` :contentReference[oaicite:18]{index=18}

Then, inside Codex:
- `/mcp` shows active servers/tools. :contentReference[oaicite:19]{index=19}

### 3.1.2 Tooling behavior inside Codex
Codex can call MCP tools during the session, so users can say:
- “Call `ctxkit.context_pack` for my request and use it as the context header.”
- “Log this tool run via `ctxkit.log_event`.”
- “Propose `.ctx` updates now.”

**Best-practice directive (to ship as default instructions)**
- Before responding to a user prompt, call `ctxkit.context_pack(mode=turn)`.
- Before running shell/apply_patch/file ops, call `ctxkit.context_pack(mode=tool, tool_intent=...)`.
- After each tool, call `ctxkit.log_event`.

---

## 3.2 Codex `AGENTS.md` Adapter (game-changer “always-on”)

Codex CLI automatically enumerates and injects `AGENTS.md` from:
- `~/.codex` and each directory from repo root → CWD,
- merges them in order (deeper overrides earlier),
- injects each as a user-role message. :contentReference[oaicite:20]{index=20}

### 3.2.1 Adapter package
**Name:** `ctxkit-codex-agents`

### 3.2.2 What it does
- Generates **Codex-native** instruction files from `.ctx`:
  - `AGENTS.md` at repo root summarizes global project memory and directs Codex to use ctxkit.
  - Optional per-directory `AGENTS.md` mirrors directory `.ctx` (short, token-budgeted).
- Adds a stable “CtxKit usage policy” block to each generated file:
  - how to call MCP tools (preferred)
  - how to fallback to `ctxkit` CLI

### 3.2.3 Sync command
Provide:
- `ctxkit codex sync-agents`
  - Reads `.ctx` hierarchy
  - Writes/updates `AGENTS.md` files with minimal diffs
  - Never writes secrets (apply redaction + policy filters)

### 3.2.4 Why this matters
Even if MCP tools aren’t used, Codex will still:
- see consistent “how to behave” instructions per directory,
- and follow the repo’s memory structure. :contentReference[oaicite:21]{index=21}

---

## 3.3 Codex CLI fallback: use ctxkit via local shell
Because Codex can run commands locally, users can directly request:
- `ctxkit inject "..." --json`
- `ctxkit propose ...`
- `ctxkit sessions list`

Codex “local shell tool” is designed for executing commands in the user-controlled runtime. :contentReference[oaicite:22]{index=22}

---

## 4) Shared MCP server spec (`ctxkit-mcp`)

### 4.1 Transport
- **stdio** by default (best compatibility across CLIs)
- optional HTTP later

### 4.2 Tool schemas (high-level)
- `ctxkit.context_pack`
  - input: `{ session_id, repo_root, cwd, request, mode, token_budget, tool_intent?, touched_files? }`
  - output: `{ pack_id, inject_text, token_estimate, items[], omitted[], deep_read? }`
- `ctxkit.log_event`
  - input: `{ session_id, event_type, payload }`
  - output: `{ event_id }`
- `ctxkit.propose_update`
  - input: `{ session_id, scope, learned_facts?, evidence_paths? }`
  - output: `{ proposal_id, diff, summary }`
- `ctxkit.apply_proposal`
  - input: `{ proposal_id }`
  - output: `{ applied: true }`

---

## 5) “Use CtxKit from within Claude Code / Codex” UX requirements

### 5.1 Claude Code UX
- Users can type:
  - `/ctxkit` → shows help + common actions
- CtxKit runs automatically:
  - context injected on `UserPromptSubmit`
  - tool-level packs injected on `PreToolUse`
- Everything appears in the session timeline (via PostToolUse logs)

(Claude Code hooks explicitly support adding context to prompts and session start.) :contentReference[oaicite:23]{index=23}

### 5.2 Codex UX
- Users can type:
  - `/mcp` → confirm ctxkit tools are active :contentReference[oaicite:24]{index=24}
  - “Use `ctxkit.context_pack` now”
- Default behavior can be enforced via `AGENTS.md` injection semantics. :contentReference[oaicite:25]{index=25}
- CLI fallback always works via local command execution. :contentReference[oaicite:26]{index=26}

---

## 6) Acceptance criteria (adapter-specific)

### Claude Code Adapter
- A1: SessionStart hook starts/attaches to daemon and sets `CTXKIT_SESSION_ID` via `CLAUDE_ENV_FILE`. :contentReference[oaicite:27]{index=27}
- A2: UserPromptSubmit hook injects `additionalContext` containing Context Pack text. :contentReference[oaicite:28]{index=28}
- A3: PreToolUse injects tool-specific context and logs tool usage.
- A4: TaskCompleted triggers proposal generation and surfaces proposal id.

### Codex Adapter
- B1: `codex mcp add ctxkit ...` registers the MCP server and tools show up in `/mcp`. :contentReference[oaicite:29]{index=29}
- B2: `ctxkit codex sync-agents` produces valid `AGENTS.md` files that Codex injects per directory. :contentReference[oaicite:30]{index=30}
- B3: Codex can call ctxkit via local shell if MCP isn’t available. :contentReference[oaicite:31]{index=31}

---

## 7) Minimal “v1 deliverables” checklist

- [ ] `ctxkit-mcp` (stdio MCP server)
- [ ] `ctxkit-claude-plugin`:
  - [ ] hooks: SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, TaskCompleted, PreCompact
  - [ ] skill: `/ctxkit`
- [ ] `ctxkit-codex-agents`:
  - [ ] `ctxkit codex sync-agents`
  - [ ] generated `AGENTS.md` templates
- [ ] E2E demos:
  - [ ] Claude Code: injection + tool logging + proposal review
  - [ ] Codex: MCP tool call + AGENTS.md injection path

---

## 8) Notes on safety
Claude Code hooks can execute commands and inject context, so the adapter must:
- default to “safe scopes” (user settings, not repo-controlled) where possible
- respect Claude Code settings that can restrict hooks (managed hooks only, allowlists) :contentReference[oaicite:32]{index=32}
- apply CtxKit policy engine before logging or writing memory

