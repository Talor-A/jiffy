/**
 * jj-log-style id rendering: the shortest unique prefix highlighted, the
 * rest of the 8-char short id dimmed.
 */
export function ChangeId({
  id,
  prefix,
  kind = "change",
}: {
  id: string;
  prefix: string;
  kind?: "change" | "commit";
}) {
  return (
    <code className={`id-badge id-${kind}`} title={id}>
      <span className="id-prefix">{prefix}</span>
      <span className="id-rest">{id.slice(prefix.length, 8)}</span>
    </code>
  );
}
