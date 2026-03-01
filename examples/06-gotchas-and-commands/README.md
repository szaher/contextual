# Example 06: Gotchas and Commands

## What This Demonstrates

Two complementary sections that make agents immediately productive:

- **gotchas**: Warnings about known issues, sharp edges, and things that
  will bite you if you do not know about them.
- **commands**: How to build, test, run, and operate the project.

## Gotchas Section

Gotchas are the most underrated section in a `.ctx` file. They capture
tribal knowledge that is usually locked in senior developers' heads or
buried in old Slack threads.

### Gotcha Entry Structure

| Field         | Required | Description                                       |
|---------------|----------|---------------------------------------------------|
| `text`        | yes      | The warning text, written clearly for AI and humans |
| `tags`        | no       | Retrieval tags for scoring                        |
| `verified_at` | yes      | Commit hash when last verified still relevant     |
| `locked`      | no       | Prevent automated removal                         |

### What Makes a Good Gotcha

A good gotcha includes:
1. What the problem is (clearly stated)
2. When it manifests (under what conditions)
3. Where to look (file path, line number)
4. How to fix or work around it

Compare these two:

Bad gotcha:
```yaml
- text: "The database has some issues with connections."
```

Good gotcha:
```yaml
- text: |
    CRITICAL: The MySQL connection pool leaks connections when a
    migration batch fails mid-stream. If you see "Too many connections"
    errors, restart the service and check src/mysql-pool.ts:67 for
    the missing connection.release() in the error path.
  tags: [mysql, connection-pool, bugs, critical]
```

The good version tells the agent exactly what is wrong, when it happens,
and where to look.

## Commands Section

The `commands` section is a flat key-value map of named commands. Keys
are descriptive names; values are the shell commands to run.

```yaml
commands:
  build: "npm run build"
  test: "npm test"
  test:integration: "npm run test:integration -- --timeout 60000"
  dev: "npm run dev -- --dry-run"
```

### Naming Conventions

Use consistent naming with colons for namespacing:
- `build`, `build:watch`, `build:prod`
- `test`, `test:integration`, `test:mysql`
- `migrate`, `migrate:full`, `migrate:resume`

### What to Include

Include commands that an agent would need:
- How to build the project
- How to run tests (including specialized test suites)
- How to start a development server
- How to run database migrations
- How to check types and lint
- Operational commands (status checks, resets)

Do not include commands that are obvious (`npm install`) or only used
during CI (deployment scripts).

## Commands to Try

### Preview context for a debugging request

```bash
ctxkit inject --preview \
  --request "investigate the Too many connections error in production" \
  --budget 4000
```

Expected output:

```
Context Pack (820 / 4,000 tokens)

Included (4 items):
  1. [TAG_MATCH]     .ctx -> gotchas/0 "MySQL connection pool leak" (180 tok)
  2. [TAG_MATCH]     .ctx -> gotchas/4 "DB_MYSQL_SSL config" (110 tok)
  3. [LOCALITY_HIGH] .ctx -> summary (130 tok)
  4. [TAG_MATCH]     .ctx -> commands (220 tok)

Omitted (3 items):
  - .ctx -> gotchas/1 (score: 0.25, reason: LOW_SCORE)
  - .ctx -> gotchas/2 (score: 0.22, reason: LOW_SCORE)
  - .ctx -> gotchas/3 (score: 0.18, reason: LOW_SCORE)
```

The critical connection pool gotcha is surfaced first because its tags
match the error in the request.

### Preview for a migration command request

```bash
ctxkit inject --preview \
  --request "how do I run the migration for a subset of records?" \
  --budget 4000
```

Expected output shows the migration commands, the incremental sync gotcha,
and the bulk insert gotcha -- all directly relevant to running migrations.

## Best Practices

- **Tag gotchas accurately**: Tags are the primary mechanism for matching
  gotchas to requests. If a gotcha is about MySQL connections, tag it
  with `[mysql, connection-pool]`, not just `[bugs]`.

- **Lock critical gotchas**: If a gotcha describes a known bug that is
  not yet fixed, lock it to prevent automated pruning from removing it.

- **Prune resolved gotchas**: When a bug is fixed, remove or update the
  gotcha. Stale gotchas waste tokens and can mislead agents.

- **Include file references**: Point to the exact file and line number
  when possible. This gives agents (and humans) a starting point for
  investigation.

- **Keep commands up to date**: Outdated build or test commands are
  actively harmful. When you change your build system, update the
  commands section.

- **Use dry-run for dev commands**: Setting the dev command to include
  `--dry-run` or similar safety flags prevents accidental data
  modifications during development.
