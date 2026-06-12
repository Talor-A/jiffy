---
name: deduplicate-issue-prework
description: >-
  Deduplicate shared pre-work across GitHub issues by extracting foundation
  tickets and updating feature issues to link them. Use after scoping issues,
  when necessary pre-work repeats across tickets, or when the user asks to
  split blockers, deduplicate prerequisites, or clean up issue dependencies.
---

# Deduplicate Issue Pre-work

After feature issues are filed (often via `scope-feature-issues`), scan their
`## necessary pre-work` sections for overlap. Extract shared prerequisites into
foundation issues; trim originals to `#NN` links plus issue-specific items only.

**Run serially** — duplicates only become visible after reading multiple issues.

## Parent workflow

1. **Inventory** — Fetch all candidate issues:
   ```bash
   gh issue list --limit 50 --json number,title,body
   ```
   Or `gh issue view <n> --json body` per issue. Focus on `## necessary pre-work`
   (and `## Necessary pre-work` variants).

2. **Cluster shared items** — Group pre-work that appears in 2+ issues under a
   single name. Common patterns in this repo:
   - Command palette / global keyboard guards
   - ContextMenu beyond copy-only
   - Config file / env CLI resolution
   - Line/side anchor semantics
   - Commit picker modal
   - `/api/actions` / jj mutation framework
   - Post-mutation comment/spec policy
   - Stack test fixtures (`jj edit`, mid-checkout)

3. **Create foundation issues first** (one at a time, serially) — Each shared
   cluster becomes one issue with full scoping format:

   ```markdown
   ## brief
   ## implementation options
   ## necessary pre-work

   ## Blocks
   - #N — Title of blocked issue
   ```

4. **Record new issue numbers** as you create them (next numbers after existing).

5. **Update feature issues** — Replace duplicated paragraphs with links:
   ```markdown
   ## necessary pre-work

   1. **Command palette + global keyboard guards:** #13
   2. **ContextMenu actions:** #14

   **Blockers (this issue):**
   3. Product-specific decision still needed here…

   **Recommended (this issue):**
   4. Issue-specific follow-up…
   ```

6. **Summarize** — Table of foundation issues → what they block.

## What to extract vs keep

| Extract to foundation issue | Keep on feature issue |
|-----------------------------|----------------------|
| Shared component (palette, picker, ContextMenu) | Product scope decisions |
| Shared lib/module (`lib/config.ts`, `lib/anchors.ts`) | Feature-specific API shape |
| Shared test infrastructure | Feature-specific test cases |
| Cross-cutting policy (comment orphans after squash) | Action-specific eligibility rules |
| "Update HelpModal" alone | — (too small; keep inline or batch later) |

**Rule of thumb:** if 2+ issues need the same *buildable artifact* before they can
ship, extract it. If it's a one-line doc update, leave it inline.

## Foundation issue template

```bash
gh issue create --title "Short shared artifact name" --body "$(cat <<'EOF'
## brief

Colloquial explanation of the shared prerequisite and why multiple features
depend on it.

## implementation options

Viable paths with pros/cons and recommendation.

## necessary pre-work

Blockers and recommended items for *this foundation issue only* — not the
features it unblocks.

## Blocks

- #4 — Feature issue title
- #12 — Feature issue title
EOF
)"
```

Foundation issues use the same three sections as feature issues, plus **`## Blocks`**
listing every feature issue that should link to this one.

## Updating feature issues

Use `gh issue edit <n> --body "$(cat <<'EOF'…EOF)"` with the **full** body:
preserve `## brief` and `## implementation options`; only rewrite
`## necessary pre-work`.

### Link format

```markdown
1. **Short label:** #13
```

Optional detail after the link only if *unique to this feature*:

```markdown
2. **Config / editor command resolution:** #15
   * v1 env-only is enough; repo config can wait
```

### Section labels

Use consistent sub-headings on feature issues after dedup:

- `**Blockers (this issue):**` — decisions that only this feature needs
- `**Recommended (this issue):**` — follow-ups scoped to this feature

## Ordering foundation work

Create foundation issues in dependency order when clusters depend on each other:

1. Primitives with no deps (ContextMenu, config, anchors, test fixtures)
2. Infrastructure that composes them (command palette, commit picker, actions framework)
3. Policies that affect multiple actions (post-mutation comment policy)

## Constraints

- **Do not modify the codebase** — issues only, unless the user asks otherwise.
- **Serial creation** — create foundation issues one-by-one so `#Blocks` references
  are accurate; update feature issues after all foundation numbers are known.
- **Preserve issue-specific nuance** — dedup replaces repetition, not unique blockers.

## Examples

See [examples.md](examples.md) for the Jiffy #1–#12 → #13–#20 deduplication run.

## Pairing with scope-feature-issues

Typical sequence:

1. `scope-feature-issues` — investigate features, file loose implementation plans
2. `deduplicate-issue-prework` — extract shared pre-work, wire `#NN` links
3. Implement foundation issues before dependent features
