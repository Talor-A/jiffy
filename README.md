# jiffy

Local diff reviewer for [jj](https://jj-vcs.github.io/). Review your agent's
work in the browser while it runs: visualize the stack of bookmarks you're on
top of, click into any bookmark or change to see its diff, and leave line
comments that export as agent-ready markdown.

Diffs are rendered with [@pierre/diffs](https://diffs.com), the changed-file
tree with [@pierre/trees](https://trees.software).

## Usage

```bash
bun install
bun index.ts [path-to-repo]   # defaults to cwd; opens the browser
```

Options: `-p/--port N` (default 5959), `--no-open`.

### What you get

- **Stack panel** — segments of `trunk()..@` grouped by bookmark, each with a
  push-status dot (synced / moved-needs-push / never pushed), a GitHub PR
  link when one exists, and the changes it contains. Click a segment or a
  single change to review its diff.
- **Live updates** — the server polls the jj op log and pushes SSE events;
  the UI refetches as your agent commits. Reads use `--ignore-working-copy`
  so background polling never races the agent for the working-copy lock.
- **Line comments** — click a line number, write feedback, then *copy
  feedback* to get markdown grouped by file with `path:line` references and
  the commented source line. Comments persist in `.jj/jiffy/comments.json`.

## Architecture

```
index.ts            CLI entry: arg parsing, server boot, browser open
config.toml         revset aliases shipped with jiffy (--config-file on every jj call)
lib/
  exec.ts           argv-array subprocess runner (no shell, no quoting bugs)
  jj.ts             Jj class: zod-validated jj CLI interface, JSON log template
  stack.ts          pure stack segmentation + push status (unit-testable)
  github.ts         gh CLI context (PRs by head bookmark); degrades to null
  comments.ts       CommentStore + agent-markdown export
  server.ts         Bun.serve routes + SSE RepoWatcher
  schema.ts         zod schemas shared by server and client
src/                React frontend (Bun HTML imports — no separate bundler)
test/               bun test suite incl. scripted jj fixture repos
scripts/
  demo-repo.ts      build a throwaway stacked repo for development
  screenshot.ts     drive headless Chrome against a running server
```

Everything crossing a boundary (jj output, gh output, HTTP payloads) is
parsed with zod; the client imports the same schemas the server uses.

## Development

```bash
bun test                       # unit + integration (creates temp jj repos)
bun run typecheck
bun scripts/demo-repo.ts       # prints a demo repo path to point jiffy at
```
