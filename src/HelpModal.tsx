export function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>jiffy — review diffs while your agent works</h2>
          <button className="ghost" onClick={onClose}>
            ✕
          </button>
        </header>

        <section>
          <h3>Views</h3>
          <ul>
            <li>
              <b>Latest change</b> — the newest described, non-empty change
              (<code>closest_pushable(@)</code>).
            </li>
            <li>
              <b>Stack</b> — every change between trunk and <code>@</code>,
              grouped into segments by bookmark. Click a segment to review
              that bookmark's whole diff (its PR), or a single change for
              just that revision. The <b>working copy</b> segment is
              everything since the nearest bookmark, including unsaved file
              edits — "what the agent has done since I last marked a
              checkpoint".
            </li>
          </ul>
        </section>

        <section>
          <h3>Stack panel</h3>
          <ul>
            <li>
              <span className="dot dot-synced inline-dot" /> in sync with
              origin&ensp;·&ensp;
              <span className="dot dot-outdated inline-dot" /> bookmark moved,
              needs push&ensp;·&ensp;
              <span className="dot dot-unpushed inline-dot" /> never pushed
            </li>
            <li>
              <span className="wc-marker">@</span> marks the working copy;
              <span className="empty-marker inline-chip">empty</span> marks
              changes with no file modifications.
            </li>
            <li>PR badges link to GitHub (dashed border = draft).</li>
            <li>
              Right-click anything — segments, changes, files, trunk — to
              copy ids, bookmark names, PR URLs, or file paths.
            </li>
          </ul>
        </section>

        <section>
          <h3>Comments → agent feedback</h3>
          <ul>
            <li>Click a line number to comment on that line.</li>
            <li>Drag across line numbers to comment on a range.</li>
            <li>
              <kbd>⌘⏎</kbd> saves, <kbd>Esc</kbd> cancels. Comments persist in
              <code>.jj/jiffy/comments.json</code>.
            </li>
            <li>
              <b>copy feedback</b> exports everything as markdown with
              <code>file:line</code> references and the commented source —
              paste it straight to your agent.
            </li>
          </ul>
        </section>

        <section>
          <h3>Command palette</h3>
          <ul>
            <li>
              Press <kbd>⌘K</kbd> / <kbd>Ctrl+K</kbd> to open commands like
              refresh, view latest change, view working copy, or open this
              help.
            </li>
            <li>
              Shortcuts pause while a comment or description draft is open,
              another modal is open, a context menu is open, or focus is inside
              text input.
            </li>
            <li>
              <kbd>Esc</kbd> resolves in order: draft cancel → context menu →
              command palette → help.
            </li>
          </ul>
        </section>

        <section>
          <h3>Editing</h3>
          <ul>
            <li>
              Double-click a description in the diff header to edit it
              (<code>jj describe</code>).
            </li>
          </ul>
        </section>

        <section>
          <h3>Live updates</h3>
          <ul>
            <li>
              The view refreshes automatically when anything runs jj in the
              repo (the op log is polled every 2s). Reads use
              <code>--ignore-working-copy</code>, so jiffy never races your
              agent for the workspace lock.
            </li>
            <li>
              <b>↻ refresh</b> additionally snapshots the working copy, picking
              up file edits made outside jj.
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
