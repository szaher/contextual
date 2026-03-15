# Dashboard

ctxl includes a local web-based inspection dashboard built with React. The dashboard provides a visual interface for browsing sessions, inspecting injected context, reviewing proposals, and auditing memory changes.

## Accessing the Dashboard

The dashboard is served by the daemon. Start the daemon first:

```bash
ctxkit daemon start
```

Then open the dashboard:

```bash
ctxkit dashboard
```

This opens `http://localhost:3742` in your default browser. The dashboard runs entirely locally -- no network access required, no data leaves your machine.

You can also specify a custom port:

```bash
ctxkit daemon start --port 8080
ctxkit dashboard --port 8080
```

## Pages

### Sessions

The Sessions page shows all active and recent agent sessions:

- **Session list** -- displays session ID, agent, status, request count, and start time
- **Status filtering** -- toggle between active, completed, and all sessions
- **Session detail** -- click a session to see its full timeline

Each session detail view shows:
- Metadata (repo path, working directory, branch, agent ID)
- Timeline of requests with timestamps
- For each request: the request text, token usage, and budget percentage

### Memory

The Memory page lets you browse and inspect `.ctx` files:

- **File tree** -- navigate the repository structure and find `.ctx` files
- **Section viewer** -- see key_files, contracts, decisions, gotchas, and other sections
- **Entry details** -- view individual entries with their tags, verification status, and lock state
- **Staleness indicators** -- visual badges for stale or unverified entries

### Audit

The Audit page displays the history of all `.ctx` file changes:

- **Chronological log** -- all memory changes ordered by timestamp
- **Date range filter** -- narrow the view to a specific time period
- **Path filter** -- filter by `.ctx` file path
- **Change details** -- each entry shows what changed, who initiated it, when, and why
- **Diff viewer** -- see the unified diff of each change

## Inspecting Context Per Request

When you drill into a specific request within a session, the dashboard shows:

**Included Items:**

| Column | Description |
|--------|-------------|
| Source | Which `.ctx` file contributed this entry |
| Section | key_files, contracts, decisions, gotchas, or summary |
| Entry ID | The specific entry identifier |
| Score | Computed relevance score (0.0-1.0) |
| Tokens | Token count for this entry |
| Reason Codes | Why this entry was included (LOCALITY_HIGH, TAG_MATCH, etc.) |
| Staleness | Verification status and date |

**Omitted Items:**

| Column | Description |
|--------|-------------|
| Source | Which `.ctx` file contributed this entry |
| Section | The entry's section |
| Score | What the entry's score was |
| Tokens | How many tokens it would have used |
| Exclusion Reason | Why it was omitted (BUDGET_EXCEEDED, LOW_SCORE, etc.) |

**Deep-Read Decision:**

If the deep-read fallback was triggered, the dashboard shows:
- Whether deep-read was triggered
- The rationale explaining why
- Which files were read (if any)

## Reviewing Proposals

The dashboard provides a proposal review workflow:

1. **View pending proposals** -- see all proposals with status "proposed"
2. **Inspect the diff** -- unified diff view showing exactly what would change
3. **Edit the diff** -- optionally modify the proposed changes before approving
4. **Approve or reject** -- make an explicit decision
5. **Apply** -- write the approved change to the `.ctx` file

The diff viewer highlights:
- Added lines (green)
- Removed lines (red)
- Context lines (unchanged)
- Redacted secrets (marked with `[REDACTED:<type>]`)

### Commit History

The Commit History page at `/commits` shows commits with ctxkit context trailers:

- **Commit list** -- displays commit hash, subject, author, date, and parsed Ctxkit-* trailer data
- **Session linking** -- session IDs in trailers are clickable links to `/sessions/:id`
- **Trailers-only filter** -- toggle to show only commits that have Ctxkit-* trailers
- **Session filter** -- filter commits by a specific session ID
- **Trailer details** -- each commit shows the staged `.ctx` files, entry count, and timestamp from trailers

The commit history data comes from parsing `git log` output and is cached in the daemon's `commit_context` SQLite table.

### Timeline

The Timeline page at `/timeline` shows the evolution of context memory over time:

- **Memory evolution graph** -- visual timeline showing when `.ctx` files were created, modified, and how their content grew or shrank
- **Version markers** -- each `ctx_version` bump is plotted on the timeline with author and reason
- **Filtering** -- filter by `.ctx` file path, author, or date range
- **Zoom** -- zoom into specific time ranges to inspect rapid changes during agent sessions

The timeline is useful for understanding how context memory has evolved across many sessions and identifying patterns in what agents modify most frequently.

### Dependency Map

The Map page at `/map` provides an interactive dependency graph of all `.ctx` files:

- **Graph visualization** -- nodes represent `.ctx` files, edges represent `depends_on` / `depended_by` relationships from the index
- **Node details** -- click a node to see the `.ctx` file summary, tags, token count, and version
- **Highlighting** -- hover over a node to highlight its dependencies and dependents
- **Layout** -- automatic hierarchical layout with manual repositioning
- **Search** -- find nodes by path or tag

The dependency map requires the `.ctxl` index to be generated (`ctxkit index generate`).

### Conflicts

The Conflicts page at `/conflicts` provides a visual interface for resolving multi-agent conflicts:

- **Conflict list** -- all `.ctx` files with unresolved conflicts, showing conflict count and creation time
- **Side-by-side diff** -- view "ours" vs "theirs" for each conflicted section
- **Resolution controls** -- pick "ours" or "theirs" for each conflict individually
- **Session context** -- see which agent sessions produced each side of the conflict
- **Bulk resolution** -- resolve all conflicts in a file at once

### Activity Feed

The Activity page at `/activity` shows a real-time feed of all context operations:

- **Live updates** -- new events appear automatically via Server-Sent Events (SSE)
- **Event types** -- `.ctx` modifications, proposals created/applied/rejected, conflicts detected, sessions started/ended
- **Filtering** -- filter by event type, `.ctx` file path, or session
- **Event details** -- expand an event to see the full diff, author, and reason
- **Pause/resume** -- pause the live feed to inspect events without scroll jitter

### PR Context Viewer

The PR Context page at `/sessions/:id/pr` renders a preview of the PR context for a specific session:

- **Formatted preview** -- see the markdown output that `ctxkit pr` would generate
- **Section breakdown** -- summary, prompt chain, decisions, file changes, context used, and stats
- **Copy button** -- copy the rendered markdown to clipboard for pasting into a PR
- **Format toggle** -- switch between markdown preview, raw markdown, and JSON views
- **Export** -- download the PR context as a file

## Dashboard Architecture

The dashboard is a React single-page application built with Vite:

- **Frontend**: React + TypeScript, served as static files
- **Backend**: The ctxl daemon serves the built dashboard files at the root path (`/*`)
- **API**: All data comes from the daemon's REST API at `/api/v1/*`
- **Storage**: No browser-side storage; everything reads from the daemon's SQLite database

The daemon routes are configured to serve the dashboard as a fallback for any path that does not match an API route:

```typescript
// In daemon server.ts
app.use('/*', serveStatic({ root: './packages/ui/dist' }));
```

## Technical Details

The dashboard UI package is at `packages/ui/` and can be built independently:

```bash
cd packages/ui
pnpm install
pnpm build
```

The build output goes to `packages/ui/dist/` which the daemon serves as static files.

For development, you can run the Vite dev server:

```bash
cd packages/ui
pnpm dev
```

This starts a hot-reloading dev server that proxies API requests to the daemon.

## Next Steps

- Start using the dashboard by following the [Quick Start](/getting-started/quick-start)
- Learn about [Sessions](/guide/sessions) and what they track
- Understand [Proposals](/guide/proposals) and the review workflow
- See the full [HTTP API Reference](/api/http-api) that powers the dashboard
