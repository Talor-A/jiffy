import { z } from "zod";
import { CommentSchema, type Comment, type CommentInput } from "./schema";

const StoredCommentsSchema = z.object({
  version: z.literal(1),
  comments: z.array(CommentSchema),
});

/**
 * Line-comment store, persisted as JSON under the repo's `.jj` directory
 * (colocated with the repo but never tracked). Strictly parsed on load; a
 * corrupt file fails loudly rather than silently dropping feedback.
 */
export class CommentStore {
  private comments: Comment[] = [];
  private loaded = false;

  constructor(readonly path: string) {}

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    const file = Bun.file(this.path);
    if (!(await file.exists())) return;
    const data = StoredCommentsSchema.parse(await file.json());
    this.comments = data.comments;
  }

  private async save(): Promise<void> {
    await Bun.write(
      this.path,
      JSON.stringify(
        { version: 1 as const, comments: this.comments },
        null,
        2,
      ),
    );
  }

  async list(specKey?: string): Promise<Comment[]> {
    await this.load();
    return specKey
      ? this.comments.filter((c) => c.specKey === specKey)
      : [...this.comments];
  }

  async add(input: CommentInput): Promise<Comment> {
    await this.load();
    const comment: Comment = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.comments.push(comment);
    await this.save();
    return comment;
  }

  async updateText(id: string, text: string): Promise<Comment | null> {
    await this.load();
    const comment = this.comments.find((c) => c.id === id);
    if (!comment) return null;
    comment.text = text;
    await this.save();
    return comment;
  }

  async remove(id: string): Promise<boolean> {
    await this.load();
    const before = this.comments.length;
    this.comments = this.comments.filter((c) => c.id !== id);
    await this.save();
    return this.comments.length < before;
  }

  async clear(specKey?: string): Promise<number> {
    await this.load();
    const before = this.comments.length;
    this.comments = specKey
      ? this.comments.filter((c) => c.specKey !== specKey)
      : [];
    await this.save();
    return before - this.comments.length;
  }
}

/**
 * Render comments as markdown an agent can act on directly: stable
 * `path:line` references, the commented source line for grounding, and the
 * reviewer's instruction as a blockquote.
 */
export function exportMarkdown(
  comments: Comment[],
  opts: { repoLabel?: string } = {},
): string {
  if (comments.length === 0) return "No review comments.\n";

  const header = `# Review feedback${opts.repoLabel ? ` — ${opts.repoLabel}` : ""}`;
  const lines: string[] = [
    header,
    "",
    "Address each comment below. Line numbers refer to the file as it exists",
    "after the diff under review (or before it, for comments on removed lines).",
    "",
  ];

  const byFile = new Map<string, Comment[]>();
  for (const c of comments) {
    byFile.set(c.file, [...(byFile.get(c.file) ?? []), c]);
  }

  for (const [file, fileComments] of [...byFile.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    lines.push(`## ${file}`, "");
    const sorted = [...fileComments].sort((a, b) => a.line - b.line);
    for (const c of sorted) {
      const ref = c.endLine ? `${file}:${c.line}-${c.endLine}` : `${file}:${c.line}`;
      const where =
        c.side === "deletions"
          ? `${ref} (removed ${c.endLine ? "lines" : "line"})`
          : ref;
      lines.push(`- **${where}**`);
      if (c.codeLine !== null && c.codeLine.trim() !== "") {
        lines.push(`  \`\`\``);
        for (const codeLine of c.codeLine.split("\n")) {
          lines.push(`  ${codeLine}`);
        }
        lines.push(`  \`\`\``);
      }
      for (const textLine of c.text.split("\n")) {
        lines.push(`  > ${textLine}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}
