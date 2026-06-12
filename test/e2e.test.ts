import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { Server } from "bun";
import {
  chromium,
  type Browser,
  type Locator,
  type Page,
} from "playwright-core";
import frontend from "../src/index.html";
import { CommentStore } from "../lib/comments";
import { createServer, type RepoWatcher } from "../lib/server";
import { TestRepo } from "./fixtures";

/**
 * Browser e2e: boot the real server (frontend included) against a fixture
 * repo and drive it with headless Chrome via playwright-core.
 *
 * Uses the system Chrome (`channel: "chrome"`) — present on dev Macs and on
 * GitHub's ubuntu runners — so no browser download is needed. Override the
 * executable with JIFFY_CHROME if yours lives elsewhere.
 *
 * In CI this file runs as its own job (`bun run test:e2e`) and the unit job
 * skips it via JIFFY_SKIP_E2E: on Linux, Chrome teardown can corrupt an
 * epoll fd in Bun's event loop and a later Bun.spawn in the same process
 * fails with EBADF, so browser tests don't share a process with the rest.
 */
const SKIP = !!process.env.JIFFY_SKIP_E2E;

let repo: TestRepo;
let server: Server<unknown>;
let watcher: RepoWatcher;
let browser: Browser;
let page: Page;
const pageErrors: string[] = [];

/** Wait for the first match to be visible (bun's expect doesn't auto-retry). */
const see = (locator: Locator, timeout = 15_000) =>
  locator.first().waitFor({ state: "visible", timeout });

describe.skipIf(SKIP)("jiffy UI", () => {
  beforeAll(async () => {
    repo = await TestRepo.create();
    await repo.seedTrunk();
    await repo.write("a.txt", "alpha\n");
    await repo.commit("feat-a: add alpha");
    await repo.bookmark("feat-a");
    await repo.write("b.txt", "bravo\n");
    await repo.describe("wip: add bravo");

    const store = new CommentStore(
      join(repo.dir, ".jj", "jiffy", "comments.json"),
    );
    ({ server, watcher } = createServer(
      { jj: repo.jj, store, github: async () => null, frontend },
      { port: 0 },
    ));
    // Baseline op id recorded before any test mutates the repo, so the SSE
    // test's commit is always seen as a change.
    await watcher.ready;

    browser = await chromium.launch(
      process.env.JIFFY_CHROME
        ? { executablePath: process.env.JIFFY_CHROME }
        : { channel: "chrome" },
    );
    page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    page.on("pageerror", (err) => pageErrors.push(err.message));
    // domcontentloaded, not networkidle: the SSE stream never goes idle.
    await page.goto(`http://localhost:${server.port}/`, {
      waitUntil: "domcontentloaded",
    });
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    watcher?.stop();
    await server?.stop(true);
    await repo?.cleanup();
  });

  test("renders the stack sidebar", async () => {
    await see(page.locator(".diff-header"));
    await see(page.locator(".segment-name", { hasText: "feat-a" }));
    await see(page.locator(".segment-name", { hasText: "working copy" }));
    await see(page.locator(".trunk-row", { hasText: "main" }));
    expect(pageErrors).toEqual([]);
  }, 30_000);

  test("shows the working-copy diff by default", async () => {
    await see(page.locator(".diff-label", { hasText: "working copy" }));
    await see(page.locator('.file-card[data-file="b.txt"]'));
  }, 30_000);

  test("clicking a segment loads its diff", async () => {
    await page.locator(".segment-header", { hasText: "feat-a" }).click();
    await see(page.locator(".diff-label", { hasText: "feat-a" }));
    await see(page.locator('.file-card[data-file="a.txt"]'));
  }, 30_000);

  test("adds an inline comment from the gutter", async () => {
    // Pierre renders into open shadow DOM; playwright selectors pierce it.
    const card = page.locator('.file-card[data-file="a.txt"]');
    await card.locator("div[data-gutter]").first().click();
    const input = page.locator(".comment-input");
    await see(input);
    await input.fill("needs a test");
    await page.locator("button", { hasText: "comment" }).click();
    await see(page.locator(".comment-text", { hasText: "needs a test" }));
    await see(page.locator("button", { hasText: "copy feedback (1)" }));

    const res = await fetch(`http://localhost:${server.port}/api/comments`);
    const body = (await res.json()) as {
      comments: { file: string; text: string }[];
    };
    expect(body.comments).toHaveLength(1);
    expect(body.comments[0]).toMatchObject({
      file: "a.txt",
      text: "needs a test",
    });
  }, 30_000);

  test("live-updates the stack when the repo changes", async () => {
    await repo.write("c.txt", "charlie\n");
    await repo.commit("feat-b: add charlie");
    await repo.bookmark("feat-b");
    // The RepoWatcher polls the op log every 2s and pushes an SSE event.
    await see(page.locator(".segment-name", { hasText: "feat-b" }), 20_000);
  }, 30_000);
});
