# Examples — scope-feature-issues

## Parent request (user)

```
Use scope-feature-issues. For each feature below, spawn a subagent and file a
GitHub issue:

* open in IDE
* commit picker keyboard ui for split/squash/etc commands
* show comments from github if a PR is detected
...

Agents should run readonly commands or do operations inside mktemp -d, but do
not modify the working directory.
```

## Subagent prompt (Open in IDE — pre-scoped)

```
Investigate [FEATURE] in the Jiffy codebase at /Users/ta/code/jiffy.

**Task:** Create a GitHub issue for "Open in IDE". Lightly verify claims
against the codebase (readonly; jj ops in mktemp -d only). Do NOT modify the
working directory.

Scope out what it would take to implement an open in IDE function. Note any
blockers or required points of clarification. Follow this format:

## brief
## implementation options
## necessary pre-work

Use gh issue create with title "Open in IDE from diff UI".

[Paste user's investigation content here if already written.]
```

## Sample issue output (abbreviated)

See [issue #1](https://github.com/Talor-A/jiffy/issues/1) for the full write-up.
Abbreviated structure:

### brief

Jump from Jiffy's diff UI into the user's editor on a file (ideally at a line).
Today right-click only copies repo-relative paths.

### implementation options

**Option A: Client-side file:// / IDE URL schemes** — poor primary path (browser
security, inconsistent URI formats).

**Option B: Server-side open via config / auto-detected CLI (recommended)** —
`/api/open`, path validation, spawn `cursor --goto` / `code -g` / `zed`.

### necessary pre-work

**Blockers:** product scope (surfaces, file vs line), deletion line semantics,
deleted/renamed files, config format if beyond env/CLI.

**Recommended:** ContextMenu actions, path validation helper, failure UX, tests.

## gh issue create

```bash
gh issue create \
  --title "Open in IDE from diff UI" \
  --body "$(cat <<'EOF'
## brief
...

## implementation options
...

## necessary pre-work
...
EOF
)"
```
