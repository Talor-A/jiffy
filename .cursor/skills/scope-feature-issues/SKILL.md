---
name: scope-feature-issues
description: >-
  Spawn parallel subagents to investigate feature ideas in a codebase and file
  GitHub issues with implementation plans. Use when the user lists features to
  scope, wants investigation agents, feature scoping issues, or loose
  implementation plans filed via gh issue create.
---

# Scope Feature Issues

Launch one subagent per feature. Each subagent investigates the codebase, then
files a GitHub issue with a loose implementation plan.

## Parent workflow

1. Collect the feature list from the user (or a single feature).
2. Confirm `gh` auth works in this repo.
3. Launch **one `generalPurpose` subagent per feature in parallel** via the Task
   tool. Set `run_in_background: true` when there are multiple items.
4. After subagents finish, list created issues in a table (feature → issue URL).
5. Do not modify the working directory yourself — subagents handle investigation
   and issue creation.

## Subagent prompt template

Pass each subagent a prompt built from this template. Replace placeholders.

```markdown
Investigate [FEATURE] in the Jiffy codebase at [REPO_PATH] and create a GitHub
issue with a loose implementation plan.

**Constraints:**
- Readonly exploration of the repo
- jj/git/subprocess tests only inside `mktemp -d` (use `JIFFY_JJ_CONFIG` / project
  `config.toml` for jj, per CLAUDE.md)
- **Do NOT modify** [REPO_PATH] working directory

**Investigation instructions:**

Scope out what it would take to implement [FEATURE]. Note any blockers or
required points of clarification. Follow this format:

## brief

A few sentences explaining colloquially what we'd like to implement and its
requirements.

## implementation options

Detail paths to implementation. There might be only one good option in some
cases. Outline each viable option with pros/cons and give a recommendation.

## necessary pre-work

Unsolved problems that need to be worked on before implementing. Stick tightly
to the given task (good issue hygiene). Mark items as **blockers** or
**recommended**. Flag spin-off investigations and cleanup opportunities.

Also include rough effort estimates if the codebase gives enough signal.

**Deliverable:**
- Create the issue via `gh issue create` from [REPO_PATH]
- Title: short, actionable (e.g. "Open in IDE from diff UI")
- Body: the investigation in the format above
- Return the GitHub issue URL when done
```

### Optional: pre-written investigation

If the user already scoped a feature (e.g. a pasted investigation), tell the
subagent to use that content as the issue body, lightly verifying claims against
the codebase. Refine only where the code contradicts the write-up.

## Issue body requirements

Every issue must use these three sections:

| Section | Purpose |
|---------|---------|
| `## brief` | What and why, in plain language |
| `## implementation options` | Viable paths, tradeoffs, recommendation |
| `## necessary pre-work` | Blockers, recommended follow-ups, spin-offs, opportunities |

Good issues name concrete files/modules, existing patterns to reuse, and product
decisions still needed. Avoid turning pre-work into a full design doc.

## Subagent constraints (always include)

- Run readonly commands freely
- Destructive or stateful ops (jj init, commits, etc.) only inside `mktemp -d`
- Never modify the project's working directory
- Use `gh issue create` with a HEREDOC for the body when special characters appear

## Parallelism

- Independent features → launch all subagents in one message (parallel Task calls)
- Dependent features → serialize or note dependency in the subagent prompt
- Typical batch size: up to ~12 parallel agents; larger lists are fine but may take longer

## Parent summary format

When all subagents complete, report:

```markdown
| Investigation | Issue |
|---|---|
| Feature name | [#N](url) |
```

Offer to review issues for consistency, merge related ones, or add labels.

## Jiffy hotspots

When investigating, subagents should check relevant areas:

- `lib/jj.ts`, `lib/stack.ts`, `lib/server.ts`, `lib/schema.ts` — backend/jj
- `src/app.tsx`, `src/DiffViewer.tsx`, `src/ContextMenu.tsx` — UI entry points
- `lib/comments.ts`, `lib/github.ts` — comments and PR integration
- `config.toml` — revset aliases (`closest_bookmark`, etc.)

See [examples.md](examples.md) for a full prompt and sample issue output.

## Follow-up: deduplicate pre-work

After filing a batch of issues, run `deduplicate-issue-prework` to extract shared
prerequisites into foundation tickets (#13-style) and replace repeated pre-work
with `#NN` links on feature issues.
