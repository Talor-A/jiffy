#!/usr/bin/env bun
import { join, resolve } from "node:path";
import frontend from "./src/index.html";
import { help, parseCli } from "./lib/args";
import { CommentStore } from "./lib/comments";
import { Jj } from "./lib/jj";
import { createServer } from "./lib/server";

async function main(): Promise<void> {
  const args = parseCli(process.argv.slice(2));
  if (args.help) {
    console.log(help());
    return;
  }

  const reviewMode =
    args.wait ?? (process.env.CLAUDECODE === "1" && !process.stdout.isTTY);
  const status = reviewMode ? console.error : console.log;

  // Resolve the path before chdir so relative paths work from the invocation CWD.
  const targetPath = resolve(args.path);
  // Bun's dev bundler computes asset paths relative to CWD. Source runs need
  // src/ as the asset root; bundled runs need the dist/ directory itself.
  process.chdir(
    import.meta.path.endsWith(".ts") ? join(import.meta.dir, "src") : import.meta.dir,
  );

  const root = await Jj.findRoot(targetPath);
  if (!root) {
    console.error(`jiffy: ${targetPath} is not inside a jj workspace`);
    process.exit(reviewMode ? 2 : 1);
  }

  const jj = new Jj(root);
  const store = new CommentStore(join(root, ".jj", "jiffy", "comments.json"));

  const { server, watcher, review } = createServer(
    { jj, store, frontend },
    { port: args.port, reviewMode },
  );

  const url = `http://localhost:${server.port}`;
  status(`jiffy reviewing ${root}`);
  status(`→ ${url}`);

  if (args.open && process.platform === "darwin") {
    Bun.spawn(["open", url], { stdout: "ignore", stderr: "ignore" });
  }

  if (review) {
    const result = await review;
    watcher.stop();
    await server.stop();
    if (result.verdict === "request-changes") {
      process.stdout.write(result.markdown);
      console.error(
        `jiffy: changes requested (${result.count} comment${result.count === 1 ? "" : "s"})`,
      );
      process.exit(1);
    }
    console.error("jiffy: review approved");
    process.exit(0);
  }
}

if (import.meta.main) {
  await main();
}
