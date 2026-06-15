# AGENTS.md

See `README.md` and `CLAUDE.md` for architecture and the full list of commands
(`bun start`, `bun run dev`, `bun test`, `bun run typecheck`, `bun run build`).

## Cursor Cloud specific instructions

### Runtimes
- This project needs two binaries that are not part of the JS dependencies:
  `bun` (runtime + package manager, in `~/.bun/bin`) and `jj` (Jujutsu, in
  `~/.local/bin`). Both directories are already on the default login `PATH`, so
  no shell-profile edits are required. The startup update script only runs
  `bun install`; `bun` and `jj` themselves are provisioned in the VM snapshot.
- `jj` is pinned to v0.41.0 (the JSON log templates in `lib/jj.ts` assume jj
  0.41 behavior). Don't assume a newer jj will parse identically.

### Running the app
- Jiffy only works *inside an initialized jj repo*. To get one quickly, run
  `bun scripts/demo-repo.ts` — it prints the path to a throwaway stacked jj
  repo. Then point Jiffy at it: `bun run dev <printed-path> --no-open --port 5959`.
- The CLI port default is random (`0`) despite the README mentioning 5959, so
  pass `--port` explicitly when you need a known URL.
- On Linux the browser is never auto-opened (auto-open is macOS-only); use
  `--no-open` and open the URL yourself.

### Testing
- Run the main suite with `JIFFY_SKIP_E2E=1 bun run test` (58 unit/integration
  tests; they spin up real temp jj repos). This is what CI's `test` job does.
- `bun run test:e2e` drives the system Chrome via `playwright-core`. It is
  fragile/flaky on Linux headless (clicks can be intercepted by the command
  palette overlay and steps time out non-deterministically across runs), which
  is why CI runs it as a separate job. The backend/UI core paths are well
  covered by the main suite plus manual verification, so don't block on a fully
  green e2e run here.
