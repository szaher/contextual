# Example 22: Bootstrap for New Repos

The `ctxkit bootstrap` command generates `.ctx` files for an existing
repository that has never used ctxl before. It analyzes the project
structure -- package.json, tsconfig, source files, directory layout -- and
produces an initial set of `.ctx` files with summaries, key_files, tags,
and commands. This is the fastest way to get started with ctxl on an
existing codebase.

## What This Demonstrates

- Running `ctxkit bootstrap` on a project with no `.ctx` files
- What bootstrap analyzes: package.json, tsconfig.json, source file structure
- The generated `.ctx` files with auto-detected summaries, key_files, tags, and commands
- Dry-run mode for previewing without writing files
- How to customize and refine the generated files

## Files in This Example

- **`sample-project/`** -- A sample project directory with source files but
  no `.ctx` files. This represents the "before" state.
  - `package.json` -- Project metadata and scripts
  - `tsconfig.json` -- TypeScript configuration
  - `src/auth/handler.ts` -- Auth handler placeholder
  - `src/api/routes.ts` -- API routes placeholder
  - `src/utils/logger.ts` -- Logger placeholder
  - `tests/auth.test.ts` -- Test file placeholder
- **`after-bootstrap/`** -- The same project after running `ctxkit bootstrap`.
  Shows the generated `.ctx` files.

## How Bootstrap Works

### Analysis Steps

When you run `ctxkit bootstrap`, ctxl performs the following analysis:

1. **Project metadata**: Reads `package.json` (or `Cargo.toml`, `go.mod`,
   `pyproject.toml`, etc.) to determine the project name, description,
   dependencies, and scripts.

2. **Build configuration**: Reads `tsconfig.json`, `vite.config.ts`,
   `webpack.config.js`, etc. to understand the build setup.

3. **Directory structure**: Walks the source tree to identify logical
   modules (directories with multiple source files).

4. **Source analysis**: For each module directory, reads source files to
   extract:
   - Export names (functions, classes, types)
   - Import patterns (what depends on what)
   - File purposes (based on naming conventions and content)

5. **Generation**: Creates `.ctx` files at the root and in each
   significant subdirectory.

### What Gets Generated

| Section    | Source of Information                                    |
|------------|----------------------------------------------------------|
| summary    | package.json description + directory name + export analysis |
| key_files  | Files with the most exports or imports (hub files)       |
| tags       | Derived from directory name, file names, and dependencies |
| commands   | Extracted from package.json scripts                      |
| contracts  | Not generated (requires human judgment)                  |
| decisions  | Not generated (requires human judgment)                  |
| gotchas    | Not generated (requires human judgment)                  |

Bootstrap intentionally does not generate contracts, decisions, or gotchas
because these require human judgment and domain knowledge. The generated
files provide a solid starting point that developers can then enrich.

## Try It Out

### Step 1: Preview what would be generated (dry run)

```bash
cd sample-project
ctxkit bootstrap --dry-run
```

Expected output:

```
Bootstrap Preview (dry run -- no files will be written)
========================================================

Would create 4 .ctx files:

  .ctx (root)
    summary: "E-commerce API backend. TypeScript/Node.js project with
              auth, API, and utilities modules."
    key_files: package.json, tsconfig.json
    tags: [typescript, nodejs, ecommerce, api]
    commands: build, test, dev, lint

  src/auth/.ctx
    summary: "Authentication module. Handles login, token management."
    key_files: handler.ts
    tags: [auth, handler]
    commands: (inherited from root)

  src/api/.ctx
    summary: "REST API layer. Route definitions and request handling."
    key_files: routes.ts
    tags: [api, routes, rest]
    commands: (inherited from root)

  src/utils/.ctx
    summary: "Shared utilities. Logging and helper functions."
    key_files: logger.ts
    tags: [utils, logging]
    commands: (inherited from root)

Run without --dry-run to create these files.
```

### Step 2: Generate the files

```bash
ctxkit bootstrap
```

Expected output:

```
Bootstrap
==========

Analyzing project structure...
  Found: package.json (14 dependencies, 4 scripts)
  Found: tsconfig.json (strict mode, ESM)
  Found: 3 source directories (src/auth, src/api, src/utils)
  Found: 1 test directory (tests/)

Generating .ctx files...
  Created: .ctx (root)
  Created: src/auth/.ctx
  Created: src/api/.ctx
  Created: src/utils/.ctx

Generated 4 .ctx files. Version set to 2, _version set to 1.
Run 'ctxkit validate' to check for issues.
Run 'ctxkit index generate' to build the index.
```

### Step 3: Validate the generated files

```bash
ctxkit validate
```

Expected output:

```
Checking .ctx ...
Checking src/auth/.ctx ...
Checking src/api/.ctx ...
Checking src/utils/.ctx ...

All .ctx files valid. 0 errors, 0 warnings.
```

### Step 4: Customize the generated files

The generated files are a starting point. After bootstrap, you should:

1. Review and refine summaries (add domain-specific context)
2. Add contracts for critical invariants
3. Add decisions for architectural choices
4. Add gotchas for known sharp edges
5. Set `verified_at` on key_files entries
6. Mark critical entries as `locked: true`

## Key Takeaways

- `ctxkit bootstrap` is the fastest way to introduce ctxl to an existing
  codebase. It generates sensible defaults from project metadata and source
  analysis.
- Bootstrap generates summaries, key_files, tags, and commands
  automatically. Contracts, decisions, and gotchas require human input.
- Always use `--dry-run` first to preview what would be generated before
  writing files.
- The generated files set `version: 2` and `_version: 1`, initializing
  the versioning system from the start.
- Treat bootstrap output as a starting point, not a finished product.
  The real value of `.ctx` files comes from the domain-specific context
  that only humans can provide.
