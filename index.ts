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

  const root = await Jj.findRoot(resolve(args.path));
  if (!root) {
    console.error(`jiffy: ${resolve(args.path)} is not inside a jj workspace`);
    process.exit(1);
  }

  const jj = new Jj(root);
  const store = new CommentStore(join(root, ".jj", "jiffy", "comments.json"));

  const { server } = createServer({ jj, store, frontend }, { port: args.port });

  const url = `http://localhost:${server.port}`;
  console.log(`jiffy reviewing ${root}`);
  console.log(`→ ${url}`);

  if (args.open && process.platform === "darwin") {
    Bun.spawn(["open", url], { stdout: "ignore", stderr: "ignore" });
  }
}

if (import.meta.main) {
  await main();
}
