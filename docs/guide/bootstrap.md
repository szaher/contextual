# Bootstrap New Repositories

The bootstrap system analyzes a repository's structure and generates `.ctx` files automatically. This is the fastest way to add ctxl context memory to an existing project.

## Overview

Bootstrap performs three steps:

1. **Analyze** -- inspect directory contents (package.json, tsconfig, source files)
2. **Propose** -- generate `.ctx` file proposals for each directory
3. **Apply** -- write the `.ctx` files and generate the `.ctxl` index

## CLI Usage

### Basic Bootstrap

```bash
# Bootstrap the current repository
ctxkit bootstrap

# Output
Analyzing /path/to/repo...
  Scanning 42 directories...
  Found 8 directories with sufficient content

Proposals:
  .ctx                 summary, 5 key_files, 3 commands, 4 tags
  src/auth/.ctx        summary, 3 key_files, 2 contracts, 3 tags
  src/db/.ctx          summary, 4 key_files, 1 contract, 2 tags
  src/api/.ctx         summary, 6 key_files, 2 contracts, 4 tags
  src/utils/.ctx       summary, 2 key_files, 2 tags
  packages/core/.ctx   summary, 8 key_files, 3 commands, 5 tags
  packages/cli/.ctx    summary, 4 key_files, 2 commands, 3 tags
  packages/ui/.ctx     summary, 3 key_files, 2 commands, 4 tags

Applied 8 .ctx files
Generated .ctxl index (8 entries)
```

### Dry Run

Preview what would be generated without writing any files:

```bash
ctxkit bootstrap --dry-run

# Output
[dry-run] Would create 8 .ctx files:

.ctx:
  version: 2
  summary: "TypeScript monorepo for context memory system"
  key_files:
    - path: package.json
      purpose: "Root package configuration"
    - path: tsconfig.json
      purpose: "TypeScript configuration"
  ...

src/auth/.ctx:
  version: 2
  summary: "Authentication and authorization module"
  ...
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--dry-run` | `false` | Preview without writing files |
| `--mode <mode>` | `quick` | Analysis depth: `quick` or `full` |
| `--skip-existing` | `false` | Do not overwrite existing `.ctx` files |
| `--min-files <n>` | `3` | Minimum source files to generate a `.ctx` for a directory |

### Analysis Modes

**Quick mode** (`--mode quick`):

- Reads only `package.json`, `tsconfig.json`, and README files
- Detects entry points (`src/index.ts`, `src/main.ts`, etc.)
- Generates basic summaries and key_files
- Fast: processes a large monorepo in seconds

**Full mode** (`--mode full`):

- Everything in quick mode, plus:
- Scans source files for exported functions and classes
- Detects imports to build dependency relationships
- Identifies test files and generates `commands` entries
- Analyzes JSDoc/TSDoc comments for summaries
- Detects API routes and generates contract suggestions
- Slower but produces richer `.ctx` files

## How Analysis Works

### `analyzeDirectory()`

The analysis inspects each directory for signals:

**package.json:**
- `description` field becomes the `.ctx` summary
- `scripts` become `commands` entries
- `keywords` become tags
- `dependencies` are analyzed for tech stack detection (typescript, react, vue, express, etc.)

**tsconfig.json:**
- Added as a key file with `typescript` tag
- `paths` entries inform dependency relationships

**Source files:**
- Entry points (`index.ts`, `main.ts`, `app.ts`) are added as key files
- Files with many exports are flagged as key files
- Test files (`*.test.ts`, `*.spec.ts`) are detected for `commands` entries

**README / readme:**
- First content paragraph becomes the summary (if no `package.json` description)

### `generateProposal()`

After analysis, proposals are generated with:

- **summary** -- derived from package.json description, README, or directory name
- **key_files** -- entry points, package.json, tsconfig, and heavily-exported files
- **tags** -- from package.json keywords and detected technology stack
- **commands** -- from package.json scripts (build, test, lint, dev)
- **contracts** -- (full mode only) from detected API routes and validation rules

Each proposal includes a `ctx_version: 1` and an initial `_history` entry.

### `applyProposals()`

Applying proposals:

1. Writes each `.ctx` file to disk
2. Generates the `.ctxl` index with all entries
3. Records an audit entry for each created file

## Skip Existing

When `--skip-existing` is set, directories that already have a `.ctx` file are left untouched:

```bash
ctxkit bootstrap --skip-existing

# Output
Analyzing /path/to/repo...
  Scanning 42 directories...
  Found 8 directories with sufficient content
  Skipping 3 directories with existing .ctx files

Applied 5 .ctx files (3 skipped)
Generated .ctxl index (8 entries)
```

This is useful when you want to bootstrap new directories in a project that already has some `.ctx` files.

## Minimum Files Threshold

The `--min-files` option controls how many source files a directory must contain before a `.ctx` file is generated:

```bash
# Only generate .ctx for directories with 5+ source files
ctxkit bootstrap --min-files 5
```

Directories below the threshold are skipped. This prevents cluttering the repository with `.ctx` files for trivial directories like `utils/` with a single file.

## Programmatic API

```typescript
import { analyzeDirectory, generateProposal, applyProposals } from '@ctxkit/core'

// Analyze a single directory
const analysis = analyzeDirectory('/path/to/repo/src/auth', {
  mode: 'full',
})

console.log(analysis.summary)      // "Authentication module"
console.log(analysis.key_files)    // [{path: 'login.ts', purpose: '...'}, ...]
console.log(analysis.tags)         // ['auth', 'typescript']
console.log(analysis.commands)     // {test: 'vitest run'}

// Generate a .ctx proposal from the analysis
const proposal = generateProposal(analysis)

// Apply proposals across the repo
const results = applyProposals('/path/to/repo', proposals, {
  skipExisting: false,
  dryRun: false,
})
```

## Best Practices

1. **Start with dry-run** -- always preview before writing to understand what will be generated.

2. **Use quick mode first** -- bootstrap with `--mode quick`, then manually refine the generated `.ctx` files. Add contracts and decisions by hand since they require domain knowledge.

3. **Bootstrap then customize** -- the generated `.ctx` files are a starting point. Edit them to add contracts, decisions, and gotchas that automated analysis cannot detect.

4. **Use --skip-existing when adding** -- when bootstrapping a project that already has some `.ctx` files, use `--skip-existing` to avoid overwriting manual customizations.

5. **Run index generate after manual edits** -- after customizing the generated `.ctx` files, run `ctxkit index generate` to update the index.

## Next Steps

- Learn about the [.ctx File Format](/guide/ctx-format) to customize generated files
- Understand the [Index System](/guide/index-system) that catalogs generated files
- See how [Auto-Update](/guide/auto-update) keeps bootstrapped files fresh
- Read about [Migration](/guide/migration) for upgrading existing v1 files
