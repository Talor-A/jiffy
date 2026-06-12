---
name: jj-workflow
description: >-
  Jujutsu (jj) workflows for describing changes, creating clean commits,
  bookmarks, pushing to GitHub, and opening PRs. Use when committing with jj,
  creating bookmarks/branches, pushing with jj git push, or making PRs after jj
  work. Always use desc -m to avoid $EDITOR hangs.
---

# jj Workflow

Use **jj** for local version control (describe, bookmark, push). A **bookmark** is a branch. The repo is still a regular git repository — readonly `git` commands are fine for convenience (e.g. `git diff <sha>`, or `jj diff --git <change-id-or-sha>` for git-format patches). Use jj (not `git commit` / `git push`) when mutating history or publishing.

## Critical: never bare `jj desc`

`jj desc` without `-m` opens `$EDITOR` and **hangs** in agent/non-interactive shells.

```bash
jj desc -m "Short imperative summary"
```

## Start clean on latest main

Run from the repo root after fetching:

```bash
jj git fetch
jj new main@origin
```

- `jj git fetch` — pull latest from GitHub (origin).
- `jj new main@origin` — new empty change whose parent is remote `main`.

To move the working copy onto an existing bookmark instead of starting fresh:

```bash
jj git fetch
jj edit main@origin
```

Prefer `jj new main@origin` when beginning issue work.

## Describe (commit message)

```bash
jj desc -m "Fix keyboard shortcut guard in command palette"
```

Amend the current change description any time before push.

## Bookmark (branch)

Create a bookmark on the current change:

```bash
jj bookmark create my-feature -r @
```

List bookmarks:

```bash
jj bookmark list
```

Rename or delete as needed (`jj bookmark rename`, `jj bookmark delete`).

## Push to GitHub

Push the bookmark to origin:

```bash
jj git push --bookmark my-feature
```

If the bookmark is new on the remote, jj creates the remote branch.

## Open a PR (gh)

Use `gh` after pushing. **Link the issue** in the body. Keep the PR body minimal — let the diff speak.

```bash
gh pr create \
  --title "Fix keyboard shortcut guard in command palette" \
  --body "$(cat <<'EOF'
Fixes #42
EOF
)" \
  --head my-feature
```

Guidelines:

- Title: imperative, matches the change (can mirror `jj desc`).
- Body: `Fixes #N` (or `Closes #N`) is enough unless CI/checklist is required.
- Do not paste the full issue plan into the PR body.

## End-to-end checklist

```text
- [ ] jj git fetch
- [ ] jj new main@origin
- [ ] … make edits …
- [ ] bun test (or project test command)
- [ ] jj desc -m "…"
- [ ] jj bookmark create <name> -r @
- [ ] jj git push --bookmark <name>
- [ ] gh pr create --title "…" --body "Fixes #N" --head <name>
```

## Common mistakes

| Mistake | Fix |
|---------|-----|
| `jj desc` hangs | Always `jj desc -m "message"` |
| Working on stale main | `jj git fetch` before `jj new main@origin` |
| No remote branch | `jj git push --bookmark <name>` before `gh pr create` |
| PR not linked to issue | Body must include `Fixes #N` |
