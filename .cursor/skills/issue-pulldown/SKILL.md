---
name: issue-pulldown
description: >-
  Pull a "Ready to work on" issue from the Talor-A GitHub project board, validate
  it is actionable, sync jj to main, implement via a gpt-5.5-medium subagent, and
  open a minimal PR. Use when the user asks to pull down work, pick up an issue
  from the board, or run the issue pulldown workflow.
---

# Issue Pulldown

Automated pickup from the Jiffy project board → validate → jj main → implement → PR.

**Board:** https://github.com/users/Talor-A/projects/3/views/2  
**Project:** `#3`, owner `Talor-A`, repo `Talor-A/jiffy`

## Prerequisites

`gh` must have project scopes. If commands fail with `missing required scopes [read:project]`:

```bash
gh auth refresh -h github.com -s read:project -s project
```

Complete the browser/device flow, then retry.

## Constants

```bash
PROJECT_OWNER="Talor-A"
PROJECT_NUM=3
REPO="Talor-A/jiffy"
STATUS_READY="Ready to work on"
STATUS_WAITING="Waiting for human"
```

Resolve IDs at runtime (do not hardcode — they differ per project):

```bash
PROJECT_ID=$(gh project view "$PROJECT_NUM" --owner "$PROJECT_OWNER" --format json --jq .id)

STATUS_FIELD_ID=$(gh project field-list "$PROJECT_NUM" --owner "$PROJECT_OWNER" --format json \
  --jq '.fields[] | select(.name == "Status") | .id')

READY_OPTION_ID=$(gh project field-list "$PROJECT_NUM" --owner "$PROJECT_OWNER" --format json \
  --jq ".fields[] | select(.name == \"Status\") | .options[] | select(.name == \"$STATUS_READY\") | .id")

WAITING_OPTION_ID=$(gh project field-list "$PROJECT_NUM" --owner "$PROJECT_OWNER" --format json \
  --jq ".fields[] | select(.name == \"Status\") | .options[] | select(.name == \"$STATUS_WAITING\") | .id")
```

See [project-board.md](project-board.md) for list/edit helpers.

## Workflow

Copy this checklist and track progress:

```text
- [ ] 1. Fetch a ready issue from the board
- [ ] 2. Validate readiness (or reject → waiting for human)
- [ ] 3. jj fetch + new main@origin
- [ ] 4. Launch implementation subagent (gpt-5.5-medium)
- [ ] 5. Subagent commits with jj + opens minimal PR
```

### Step 1 — Fetch a ready issue

List candidates (oldest first — pick the first valid issue):

```bash
gh project item-list "$PROJECT_NUM" --owner "$PROJECT_OWNER" \
  --query "status:\"$STATUS_READY\" is:issue is:open" \
  --format json --limit 20
```

From JSON, take the first item with a `content.number`. Load the full issue:

```bash
gh issue view <N> --repo "$REPO" --json number,title,body,url
```

Record `item-id` (project item ID) for status updates later.

If no items match, stop and report the board is empty.

### Step 2 — Validate readiness

Read the issue body. Issues filed via `scope-feature-issues` use `## brief`, `## implementation options`, `## necessary pre-work`.

**Ready** when ALL of the following hold:

1. **Single chosen approach** — `## implementation options` has one clear recommendation (e.g. "Option B (recommended)" or an explicit "**Recommendation:**"). Multiple undecided options → **not ready**.
2. **No unresolved blockers** — Under `## necessary pre-work`, items labeled **Blockers** are either absent, completed, or replaced with `#NN` links to issues that are closed/merged. Open-ended product questions → **not ready**.
3. **No pre-implementation cleanup** — Body does not say to scope further, deduplicate pre-work, split the issue, or wait for human decisions.
4. **Actionable scope** — A competent implementer could start coding without choosing between architectures.

**If not ready:**

1. Post a comment (specific gaps, not generic):

```bash
gh issue comment <N> --repo "$REPO" --body "$(cat <<'EOF'
Not ready for autonomous implementation:

- [Specific gap, e.g. "Two options (A/B) with no recommendation"]
- [Specific gap, e.g. "Blocker #4 (product scope) is still open"]

Please update the issue (pick one approach, resolve blockers, or split scope), then move back to **Ready to work on**.
EOF
)"
```

2. Move the project item to **Waiting for human**:

```bash
gh project item-edit \
  --id "<ITEM_ID>" \
  --project-id "$PROJECT_ID" \
  --field-id "$STATUS_FIELD_ID" \
  --single-select-option-id "$WAITING_OPTION_ID"
```

3. Return to Step 1 for the next ready issue, or stop if none remain.

**If ready:** proceed. Optionally move the item to an in-progress status if the board has one.

### Step 3 — Sync jj to main

From the repo root (`Talor-A/jiffy`):

```bash
jj git fetch
jj new main@origin
```

Follow [jj-workflow](../jj-workflow/SKILL.md) for details.

### Step 4 — Launch implementation subagent

Launch **one** `generalPurpose` subagent with `model: gpt-5.5-medium` (GPT 5.5). Use `run_in_background: false` so you can report the PR URL when done.

Pass a prompt from [subagent-prompt.md](subagent-prompt.md). Replace `<ISSUE_NUMBER>`, `<ISSUE_TITLE>`, `<ISSUE_URL>`, and paste the issue body.

The subagent owns: implementation, tests, jj commit/bookmark/push, and `gh pr create`.

### Step 5 — Parent summary

When the subagent finishes, report:

```markdown
| Issue | PR | Status |
|-------|-----|--------|
| [#N title](issue-url) | [#M](pr-url) | merged-ready / open |
```

If the subagent could not finish (blocker, failing tests), summarize what remains — do not silently drop the issue.

## Subagent constraints

Include in every implementation subagent prompt:

- Implement the **recommended** option from the issue; do not re-open architecture debates.
- Follow project conventions (Bun, `bun test`, jj not git).
- Use [jj-workflow](../jj-workflow/SKILL.md) for all VCS operations.
- PR body: `Fixes #N` only unless a checklist is required.
- Do not amend unrelated issues or drive-by refactors.

## Pairing with other skills

| Phase | Skill |
|-------|-------|
| Issue was scoped | `scope-feature-issues` |
| Pre-work deduped | `deduplicate-issue-prework` |
| Commit + PR | `jj-workflow` |

## Troubleshooting

| Problem | Action |
|---------|--------|
| `read:project` scope error | `gh auth refresh -h github.com -s read:project -s project` |
| Status option not found | Re-run field-list JSON; confirm exact option spelling on the board |
| `jj new` on wrong parent | `jj git fetch` then `jj new main@origin` again |
| Subagent hung on `jj desc` | Must use `jj desc -m "…"` |
