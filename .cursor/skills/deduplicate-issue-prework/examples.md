# Examples — deduplicate-issue-prework

## Parent request (user)

```
let's deduplicate pre-work. for each issue, if it has shared pre-work, split
the pre-work out into a new ticket. the new ticket should say which tickets
it's blocking, and the old tickets should be updated to just have a link to
the new ticket instead of a long repeated description.
```

## Before (repeated across #4, #5, #7)

Each issue had its own paragraph about:

- No command palette in `package.json`
- `⌘K` handler at `App` root
- `editingRef` / modal guard policy
- Hand-rolled modal like `HelpModal.tsx`

## After — foundation issue #13

Title: **Command palette and global keyboard infrastructure**

```markdown
## Blocks

- #4 — Commit picker keyboard UI for stack operations
- #5 — Command palette: review external PR by URL
- #7 — Keyboard navigation for hunks, files, changes, bookmarks
```

## Before (repeated across #1, #6, #11, #12)

Long `ContextMenu.tsx` copy-only limitation + need for `onSelect` callbacks.

## After — foundation issue #14

Feature issues now say:

```markdown
1. **ContextMenu actions:** #14
```

## Full foundation map (Jiffy run)

| Foundation | Blocks |
|------------|--------|
| #13 Command palette | #4, #5, #7 |
| #14 ContextMenu actions | #1, #4, #6, #11, #12 |
| #15 Config file | #1, #2 |
| #16 Line/side anchors | #1, #8, #11 |
| #17 Commit picker | #4, #12 |
| #18 Jj actions framework | #4, #6, #9, #12 |
| #19 Comment/spec policy | #4, #6, #9, #12 |
| #20 Stack test fixtures | #3, #10 |

## Updated feature issue excerpt (#12)

```markdown
## Necessary pre-work

1. **ContextMenu / action menu:** #14
2. **Commit picker (option B):** #17
3. **Jj mutation actions framework:** #18
4. **Post-mutation comment / spec policy:** #19

**This issue:**

5. **Description merge policy** — Default `--use-destination-message` vs combined `-m`…
6. **Safety & eligibility** — Immutable, merge sources, empty source…
```

## What we did *not* extract

- Per-feature HelpModal one-liners (too small)
- GitHub permalink URL builder (#11-specific — only shared the side→ref mapping via #16)
- External PR `DiffSpec` schema (#5-specific)
