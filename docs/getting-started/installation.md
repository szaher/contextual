# Installation

## Prerequisites

Before installing ctxl, ensure you have:

- **Node.js 20+** -- ctxl uses modern Node.js APIs and ES modules
- **pnpm 9+** -- the monorepo uses pnpm workspaces for package management
- **Git** -- required for drift detection and repo-root discovery

Verify your environment:

```bash
node --version   # v20.0.0 or higher
pnpm --version   # 9.0.0 or higher
git --version    # any recent version
```

## Install from npm

The fastest way to get started:

```bash
# Install the CLI globally
npm install -g @ctxkit/cli

# Or use npx without installing
npx @ctxkit/cli --version
```

Individual packages:

```bash
npm install @ctxkit/core          # Context engine library
npm install @ctxkit/daemon        # HTTP daemon with SQLite
npm install @ctxkit/mcp           # MCP server for agent integration
npm install @ctxkit/claude-plugin # Claude Code plugin
npm install @ctxkit/speckit-bridge # Spec-kit bidirectional sync
```

## Clone and Install (Development)

```bash
git clone https://github.com/szaher/contextual.git
cd contextual
pnpm install
```

## Build All Packages

The monorepo contains four packages that must be built in dependency order. The root build script handles this:

```bash
pnpm build
```

This compiles:

1. `@ctxkit/core` -- the foundation library (parser, scorer, packer, differ, drift, config, redaction)
2. `@ctxkit/daemon` -- the HTTP daemon (depends on core)
3. `@ctxkit/cli` -- the `ctxkit` CLI (depends on core)
4. `@ctxkit/ui` -- the React dashboard (standalone, served by daemon)

## Verify the Installation

After building, confirm the CLI is working:

```bash
# Run from the monorepo root
npx ctxkit --version
# Expected output: 0.1.0

# Or link it globally
pnpm link --global ./packages/cli
ctxkit --version
```

Run the test suite to verify everything is operational:

```bash
pnpm test
```

## Package Structure

```
ctxl/
  packages/
    core/       # @ctxkit/core - context engine library
    daemon/     # @ctxkit/daemon - HTTP daemon with SQLite
    cli/        # @ctxkit/cli - ctxkit command-line tool
    ui/         # @ctxkit/ui - React inspection dashboard
  tests/        # Integration and e2e tests
  docs/         # This documentation site
```

## Development Mode

For active development, run the dev watcher across all packages:

```bash
pnpm dev
```

This starts TypeScript watchers in parallel for core, daemon, and cli, and the Vite dev server for the UI.

## Running Tests

```bash
# Unit and integration tests
pnpm test

# E2E tests
pnpm test:e2e

# Linting
pnpm lint

# Format check
pnpm format:check
```

## Next Steps

Once installed, proceed to the [Quick Start](/getting-started/quick-start) to initialize your first `.ctx` file and build a Context Pack.
