# Research: Context & Memory Manager

**Branch**: `001-context-memory-manager` | **Date**: 2026-02-28

## Technology Decisions

### 1. .ctx File Format: YAML

**Decision**: YAML (plain `.ctx` files with YAML content)

**Rationale**: Native structure for the required sections (maps
for key_files, arrays for decisions/gotchas, per-entry metadata).
Parseable without custom grammar. Human-readable when
well-formatted. Git-diffable. Every editor has YAML syntax
highlighting.

**Alternatives considered**:
- **Markdown with frontmatter**: More readable for prose-heavy
  content, but the structured sections (key_files, decisions,
  contracts, staleness metadata per entry) are awkward to
  represent. Requires a custom parser for the body.
- **JSON**: Not human-friendly for editing. Noisy diffs.
- **TOML**: Poor support for deeply nested structures and arrays
  of complex objects that .ctx needs.

### 2. Monorepo Tool: pnpm workspaces

**Decision**: pnpm workspaces

**Rationale**: Lightest footprint with content-addressable storage,
fast installs, and native workspace protocol. No orchestration
layer needed for 4 packages.

**Alternatives considered**:
- **npm workspaces**: Slower installs, more disk usage.
- **Turborepo**: Build caching/orchestration overkill for 4
  packages.
- **Nx**: Heavy dependency with code generation unnecessary here.

### 3. HTTP Server: Hono

**Decision**: Hono

**Rationale**: TypeScript-first, near-zero dependencies (~12KB),
excellent type inference for routes. Ideal for a local daemon
serving API + static UI files. Well-established (20k+ stars,
used by Cloudflare, Deno).

**Alternatives considered**:
- **Fastify**: More dependencies and features than needed for
  local-only use.
- **Express**: Not TypeScript-first, aging ecosystem.

### 4. SQLite Binding: better-sqlite3

**Decision**: better-sqlite3 (raw SQL, no ORM)

**Rationale**: Synchronous API simplifies local daemon code. Fastest
Node.js SQLite binding. Schema is straightforward (4 tables) — no
ORM abstraction needed. WAL mode handles concurrent reads.

**Alternatives considered**:
- **drizzle-orm + better-sqlite3**: ORM overhead unjustified for
  simple schema.
- **sql.js**: Pure JS, slower, larger memory footprint.

### 5. CLI Framework: Commander.js

**Decision**: Commander.js

**Rationale**: Zero dependencies, stable, clean TypeScript typings.
Declarative syntax sufficient for ~8 commands (init, validate,
inject, propose, apply, sessions, drift, run).

**Alternatives considered**:
- **yargs**: Heavier API surface with builder pattern.
- **oclif**: Framework-heavy, designed for complex CLIs.

### 6. UI Stack: Vite + React + shadcn/ui

**Decision**: Vite for bundling, React for rendering, shadcn/ui
for components.

**Rationale**: Vite is the standard bundler (fastest dev server,
simple static build output for daemon to serve). shadcn/ui copies
components into the codebase (no runtime dependency), uses Radix
primitives, includes data tables/forms ideal for inspection
dashboards.

**Alternatives considered**:
- **Radix only**: Lower-level, more custom styling work.
- **Ant Design**: Heavy bundle, too many features.

### 7. File Locking: proper-lockfile

**Decision**: proper-lockfile

**Rationale**: Cross-platform atomic locking with stale lock
detection and automatic cleanup. Battle-tested for multi-process
file coordination.

**Alternatives considered**:
- **lockfile**: Less actively maintained, fewer stale-lock
  guarantees.
- **Custom flock**: Unix-only, requires edge case handling.

### 8. Token Estimation: chars/4 Approximation

**Decision**: `Math.ceil(text.length / 4)` for MVP

**Rationale**: ~80% accuracy, zero dependencies, instant execution.
Sufficient for local tooling where budget is advisory. Pluggable
interface allows swapping to tiktoken later.

**Alternatives considered**:
- **tiktoken**: Requires WASM/native bindings, large dependency.
- **js-tiktoken**: Still significant bundle size for marginal
  accuracy improvement.

### 9. YAML Parser: js-yaml

**Decision**: js-yaml

**Rationale**: Most battle-tested YAML parser in Node.js. Robust
error handling, full YAML 1.2 support, excellent TypeScript types.

**Alternatives considered**:
- **yaml (npm)**: Newer, less ecosystem adoption.
- **Custom**: YAML spec complexity makes custom parser risky.

### 10. Secret Detection: Custom Regex Patterns

**Decision**: Custom regex set

**Rationale**: Patterns for common secret types (AWS keys, API
tokens with high entropy, base64-encoded secrets, PEM blocks,
connection strings). Zero dependencies, synchronous execution.

**Alternatives considered**:
- **gitleaks patterns**: Large rule database, external tool
  dependency.

## Stack Summary

| Layer | Choice | Dependency Count |
|-------|--------|-----------------|
| Monorepo | pnpm workspaces | 0 (built-in) |
| Daemon HTTP | Hono | ~1 |
| Storage | better-sqlite3 | ~1 |
| CLI | Commander.js | 0 |
| UI Bundler | Vite | dev only |
| UI Framework | React + shadcn/ui | ~3 runtime |
| File Locking | proper-lockfile | ~1 |
| YAML | js-yaml | ~1 |
| Tokens | chars/4 approx | 0 |
| Secrets | Custom regex | 0 |

**Total runtime dependencies**: ~7 (excluding React/UI)
