# Implementation subagent prompt template

Replace placeholders, paste the issue body at the bottom.

```markdown
Implement GitHub issue #<ISSUE_NUMBER> in the Jiffy repo at /Users/ta/code/jiffy.

**Issue:** <ISSUE_TITLE>
**URL:** <ISSUE_URL>

**Rules:**
- Follow the **recommended** implementation path in the issue. Do not explore alternate architectures unless the recommended path is blocked — then stop and report.
- Use Bun (`bun test`, `bun run typecheck`) — not npm/node.
- All VCS via jj — read `.cursor/skills/jj-workflow/SKILL.md` and follow it exactly.
- Never run bare `jj desc` (use `jj desc -m "message"`).
- Start from latest main: already on `jj new main@origin` — do not rebase onto stale state without fetching.
- Minimal PR: title = imperative summary; body = `Fixes #<ISSUE_NUMBER>` only.
- Match existing code style; no drive-by refactors.

**Deliverables:**
1. Working implementation with tests where the repo already tests similar behavior
2. `jj desc -m "…"` on the change
3. Bookmark named `issue-<ISSUE_NUMBER>-<short-slug>` (lowercase, hyphens)
4. `jj git push --bookmark …`
5. `gh pr create` linking the issue
6. Return: PR URL, summary of changes, test commands run

**Issue body:**

<paste issue body here>
```

## Task tool invocation

```
subagent_type: generalPurpose
model: gpt-5.5-medium
run_in_background: false
description: Implement issue #N
prompt: <filled template above>
```
