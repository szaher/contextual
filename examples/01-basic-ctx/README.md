# Example 01: Basic .ctx File

## What This Demonstrates

The absolute minimum `.ctx` file needed for ctxl to work. A `.ctx` file
requires only two fields: `version` and `summary`. Everything else is
optional and can be added incrementally as the project grows.

## The .ctx File

```yaml
version: 1

summary: |
  A minimal Node.js CLI tool that converts Markdown files to HTML.
  Single-file project, no external dependencies beyond marked.
  Built as a learning exercise for .ctx files.

tags: [nodejs, cli, markdown]

commands:
  build: "npm run build"
  test: "npm test"
  run: "node dist/index.js input.md"
```

### Field Breakdown

- **version**: Always `1` for the current schema. Required. ctxl uses
  this to handle future migrations automatically.
- **summary**: A 5-15 line description of what this directory contains
  and why it matters. This is the first thing agents see. Write it for
  both humans and AI -- concise, high-signal, no filler.
- **tags**: Retrieval tags used for scoring. When a request mentions
  "markdown" or "cli", entries tagged with those terms score higher.
- **commands**: Key commands that agents (and humans) need to know.
  These are injected into context when relevant.

## Commands to Try

### Initialize a .ctx file from scratch

```bash
ctxkit init
```

This auto-generates a `.ctx` file using metadata from README, package.json,
and other files in the repository. You can then edit it by hand.

### Validate the .ctx file

```bash
ctxkit validate
```

Expected output:

```
Checking .ctx ...
All .ctx files valid. 0 errors, 0 warnings.
```

### Preview what would be injected

```bash
ctxkit inject --preview \
  --request "how do I build this project?" \
  --budget 4000
```

Expected output:

```
Context Pack (180 / 4,000 tokens)

Included (2 items):
  1. [LOCALITY_HIGH] .ctx -> summary (95 tok)
  2. [TAG_MATCH]     .ctx -> commands (85 tok)

Omitted (0 items):
  (nothing omitted)
```

## Tips

- Keep the summary under 15 lines. Agents work best with concise context.
- Use tags that match terms likely to appear in requests. Think about
  what a developer would type when asking for help.
- You do not need to list every command. Focus on the ones an agent
  would need: build, test, run, and lint are the most common.
- The `.ctx` file is meant to be checked into git. It is part of the
  project, not a personal config file.
