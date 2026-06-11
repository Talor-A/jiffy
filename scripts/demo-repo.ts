#!/usr/bin/env bun
/**
 * Build a throwaway jj repo with a realistic stacked-PR shape for developing
 * jiffy against. Prints the repo path; run jiffy on it:
 *
 *   bun scripts/demo-repo.ts
 *   bun index.ts <printed-path>
 */
import { TestRepo } from "../test/fixtures";

const repo = await TestRepo.create();
await repo.seedTrunk();

// --- feat-a: two changes, bookmarked and pushed (synced) ------------------
await repo.write(
  "src/parser.ts",
  `export function parse(input: string): string[] {
  return input.split("\\n").filter(Boolean);
}
`,
);
await repo.commit("parser: split lines and drop blanks");
await repo.write(
  "src/parser.ts",
  `export interface ParseOptions {
  trim?: boolean;
}

export function parse(input: string, options: ParseOptions = {}): string[] {
  const lines = input.split("\\n").filter(Boolean);
  return options.trim ? lines.map((l) => l.trim()) : lines;
}
`,
);
await repo.commit("parser: add trim option");
await repo.bookmark("demo/parser");
await repo.push("demo/parser");

// --- feat-b: one change, bookmarked but never pushed ----------------------
await repo.write(
  "src/render.ts",
  `import { parse } from "./parser";

export function render(input: string): string {
  return parse(input, { trim: true })
    .map((line, i) => \`\${i + 1}. \${line}\`)
    .join("\\n");
}
`,
);
await repo.write("README.md", "# fixture\n\nNow with a renderer.\n");
await repo.commit("render: numbered line renderer");
await repo.bookmark("demo/render");

// --- working stack: described wip + live edits in @ -----------------------
await repo.write(
  "src/render.ts",
  `import { parse } from "./parser";

export interface RenderOptions {
  bullet?: string;
}

export function render(input: string, options: RenderOptions = {}): string {
  const bullet = options.bullet ?? null;
  return parse(input, { trim: true })
    .map((line, i) => (bullet ? \`\${bullet} \${line}\` : \`\${i + 1}. \${line}\`))
    .join("\\n");
}
`,
);
// A bulky generated file so the diff view actually has to scroll.
const bigLines = Array.from({ length: 400 }, (_, i) =>
  i % 20 === 0
    ? `// section ${i / 20}: generated fixtures`
    : `export const fixture_${i} = { id: ${i}, label: "row ${i}", enabled: ${i % 3 === 0} };`,
);
await repo.write("src/fixtures.ts", bigLines.join("\n") + "\n");
await repo.describe("render: configurable bullets (wip)");
await repo.jjRaw(["new"]);
await repo.write("src/cli.ts", `console.log("TODO: wire up CLI");\n`);

console.log(repo.dir);
