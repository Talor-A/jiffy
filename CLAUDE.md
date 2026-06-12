---
description: Use Bun instead of Node.js, npm, pnpm, or vite.
globs: "*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json"
alwaysApply: false
---

Default to using Bun instead of Node.js.

- Use `bun <file>` instead of `node <file>` or `ts-node <file>`
- Use `bun test` instead of `jest` or `vitest`
- Use `bun build <file.html|file.ts|file.css>` instead of `webpack` or `esbuild`
- Use `bun install` instead of `npm install` or `yarn install` or `pnpm install`
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>` or `pnpm run <script>`
- Use `bunx <package> <command>` instead of `npx <package> <command>`
- Bun automatically loads .env, so don't use dotenv.

## APIs

- `Bun.serve()` supports WebSockets, HTTPS, and routes. Don't use `express`.
- `bun:sqlite` for SQLite. Don't use `better-sqlite3`.
- `Bun.redis` for Redis. Don't use `ioredis`.
- `Bun.sql` for Postgres. Don't use `pg` or `postgres.js`.
- `WebSocket` is built-in. Don't use `ws`.
- Prefer `Bun.file` over `node:fs`'s readFile/writeFile
- Bun.$`ls` instead of execa.

## Testing

Use `bun test` to run tests.

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

## Frontend

Use HTML imports with `Bun.serve()`. Don't use `vite`. HTML imports fully support React, CSS, Tailwind.

For more information, read the Bun API docs in `node_modules/bun-types/docs/**.mdx`.

For Base UI components (`@base-ui/react`), read the documentation index at https://base-ui.com/llms.txt before implementing or extending UI primitives.

---

# Jiffy — jj Diff Reviewer

Jiffy is a local CLI tool that launches a React UI for reviewing Jujutsu (jj) diffs while an agent works. Stack navigation, inline comments, PR links, and live SSE updates.

## Running

```sh
bun start           # production
bun run dev         # hot reload
bun test            # test suite
bun run typecheck   # type check only
```

`scripts/demo-repo.ts` creates a throwaway stacked jj repo for development. `scripts/screenshot.ts` drives headless Chrome against a running server.

## Architecture

```
index.ts              CLI entry — arg parsing, Jj setup, server boot, browser open
lib/
  args.ts             CLI arg parser + help text
  exec.ts             Subprocess runner (argv array, no shell injection)
  jj.ts               Typed jj interface (class Jj)
  schema.ts           All shared Zod schemas + TypeScript types
  stack.ts            Pure stack segmentation + push-status logic (no subprocesses)
  github.ts           gh CLI wrapper for PR links (graceful degradation)
  comments.ts         CommentStore + markdown export for agent feedback
  server.ts           Bun.serve routes + SSE RepoWatcher
src/
  frontend.tsx        React mount (mounts App to #root)
  app.tsx             Main React component — layout, SSE subscription, state
  DiffViewer.tsx      Diff pane with Pierre FileDiff + inline comment UI
  FileTreePanel.tsx   @pierre/trees file tree (git status, +/− counts)
  api.ts              Typed fetch client (imports server schemas)
  ChangeId.tsx        Short change-ID display with prefix highlighting
  ContextMenu.tsx     Base UI context menu (copy, action, separator items)
  HelpModal.tsx       Static help dialog
config.toml           jj revset aliases for jiffy's queries
```

## Key Abstractions

### DiffSpec (`src/api.ts`)
Stable identifier for what is currently being viewed. Survives commit amendments.
- `WC_SPEC` — working copy diff
- `LATEST_SPEC` — latest non-empty change
- `segmentSpec(bookmarkName)` — diff for a stack segment
- `changeSpec(changeId)` — diff for a specific change

### StackView (`lib/schema.ts`)
Complete model of the current stack: segments (changes grouped by bookmark), trunk, working copy, push-status booleans. Built by `assembleStack()` in `lib/stack.ts`.

### CommentStore (`lib/comments.ts`)
JSON persistence in `.jj/jiffy/comments.json`. Comments indexed by `specKey` for stable grouping. `exportMarkdown()` produces agent-ready markdown grouped by file with `file:line` references.

### RepoWatcher (`lib/server.ts`)
Polls jj op log every 2s; broadcasts `repo-changed` SSE events. Defers refetch while a comment draft is open (client signals this via `Referer` header or explicit `/api/refresh`).

## jj CLI Patterns

### `class Jj` (`lib/jj.ts`)
Primary interface to jj. All output validated with Zod. Key methods:
- `run(argv, opts)` — raw command
- `log(revset)` — returns `ChangeInfo[]`
- `bookmarks()` — returns `BookmarkRow[]`
- `trunkName()` — detects trunk bookmark name
- `diffChange(changeId)` — git-format patch for one change
- `diffRange(from, to)` — git-format patch for a range
- `describe(changeId, message)` — update commit description
- `opHeadId()` — current op log head (used by RepoWatcher for polling)

### subprocess util (`lib/exec.ts`)
- `run(argv: string[], cwd?): Promise<string>` — rejects with `CommandError` on non-zero exit
- `runToSchema<T>(schema, argv, cwd): Promise<T>` — run + Zod parse
- `succeeds(argv, cwd): Promise<boolean>` — true if exit 0

Always pass argv as an array, never a shell string. This prevents injection and handles paths with spaces.

### jj templates
jj 0.41 `json()` template can't serialize mapped lists. Build JSON arrays manually:
```ts
// DON'T: json(bookmarks)  — fails for list fields
// DO: 'bookmarks.map(|b| json(b)).join(",")' wrapped in literal brackets
```

### `--ignore-working-copy`
Pass for all background polling calls (`RepoWatcher`, `getStack`). Only omit when the diff explicitly includes the working copy (i.e., revset touches `@`). Use `revsetTouchesWorkingCopy(revset)` from `lib/jj.ts` to check.

### Config isolation in tests
Pass `--config-file <path>` to avoid touching `~/.config/jj/config.toml`. `JIFFY_JJ_CONFIG` in `lib/jj.ts` points to the project's `config.toml` which adds jiffy-specific revset aliases.

### Revsets (config.toml)
- `closest_bookmark(x)` — nearest ancestor bookmark
- `closest_pushable(x)` — nearest described, non-empty, pushable ancestor
- `unpushable(to)` — undescribed or empty non-merges

## Zod Schemas (`lib/schema.ts`)

All schemas and their inferred types are exported from here:
- `ChangeInfo` — one `jj log` line
- `BookmarkRow` — one `jj bookmark list` row
- `StackSegment` / `StackView` — stack model
- `GhPullRequest` / `GithubContext` — GitHub data
- `Comment` / `CommentInput` — inline comment
- `DiffRequest` / `DiffEndpoint` / `DiffResponse` — diff API
- `ActionRequest` — discriminated union for jj actions (describe, etc.)
- `PushStatus` — enum: `"synced" | "outdated" | "unpushed"`
- `parseJsonLines<T>(schema, text): T[]` — parse newline-delimited JSON

## Pierre Libraries

### @pierre/diffs (`src/DiffViewer.tsx`)
- `FileDiff` renders a single file's diff from a git patch
- Line annotations attach comment threads to specific lines
- Pierre diff components render into shadow DOM — Playwright selectors must pierce it (`diffs-container → pre[data-diff] → div[data-gutter]`)
- Get git-format patches from jj with `jj diff -r <rev> --git`

### @pierre/trees (`src/FileTreePanel.tsx`)
- `useFileTree({ paths, gitStatus })` + `<FileTree model={model} />` 
- `gitStatus` accepts per-path status (`added`, `modified`, `deleted`, etc.)
- Path-first identity model — use canonical path strings as IDs

## API Routes (`lib/server.ts`)

```
GET  /api/repo          Current repo info (trunkName, workingCopy)
GET  /api/stack         Full StackView
GET  /api/diff          Diff for a DiffSpec (query params)
GET  /api/comments      List comments (optionally filtered by specKey)
POST /api/comments      Add a comment
PATCH /api/comments/:id Update comment text
DELETE /api/comments/:id Delete comment
GET  /api/export        Export comments as markdown
POST /api/actions       Run a jj action (discriminated union)
POST /api/refresh       Force watcher refresh
GET  /api/events        SSE stream (broadcasts "repo-changed")
```

## Testing

Tests create temp jj repos via `jj init` in `beforeAll`. Use fixture helpers to build known commit graphs (stacked commits, bookmarks, empty changes). Test the revset logic, schema parsing, and stack segmentation against real jj output — don't mock jj.

```ts
import { Jj, JIFFY_JJ_CONFIG } from "../lib/jj";
// create a temp dir, init jj, run commits, then:
const jj = new Jj({ cwd: tmpDir, configFile: JIFFY_JJ_CONFIG });
```

## Connections to jj-pr

[Talor-A/jj-pr](https://github.com/Talor-A/jj-pr) is the sibling tool for creating/pushing PRs. Jiffy's `lib/exec.ts` and `lib/schema.ts` patterns are modeled on jj-pr. If shared utilities grow, consider extracting a `jj-common` package, but don't do it preemptively.
