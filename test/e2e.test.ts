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

const gone = (locator: Locator, timeout = 15_000) =>
  locator.first().waitFor({ state: "hidden", timeout });

describe.skipIf(SKIP)("e2e", () => {
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

  describe("jiffy UI", () => {
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

  describe("command palette", () => {
    const palette = () => page.locator(".command-panel");
    const selected = () =>
      page.locator('.command-item[data-selected="true"]');

    test("⌘K opens with the first action selected", async () => {
      await page.keyboard.press("ControlOrMeta+k");
      await see(palette());
      await expectFocusedPaletteInput();
      await see(selected());
      expect(await selected().textContent()).toContain("Refresh repository");
    }, 30_000);

    test("only the selected item is highlighted, only disabled items dimmed", async () => {
      // cmdk emits data-selected/data-disabled="true"/"false" on every item;
      // presence-based CSS selectors would light up / dim the whole list.
      const styles = await page
        .locator(".command-item")
        .evaluateAll((els) =>
          els.map((el) => ({
            selected: el.getAttribute("data-selected"),
            disabled: el.getAttribute("data-disabled"),
            background: getComputedStyle(el).backgroundColor,
            opacity: getComputedStyle(el).opacity,
          })),
        );
      expect(styles.length).toBeGreaterThan(3);
      for (const item of styles) {
        if (item.selected === "true") {
          expect(item.background).not.toBe("rgba(0, 0, 0, 0)");
        } else {
          expect(item.background).toBe("rgba(0, 0, 0, 0)");
        }
        expect(item.opacity).toBe(item.disabled === "true" ? "0.65" : "1");
      }
    }, 30_000);

    test("arrow keys move the selection", async () => {
      await page.keyboard.press("ArrowDown");
      await see(
        page.locator('.command-item[data-selected="true"]', {
          hasText: "View working copy",
        }),
      );
    }, 30_000);

    test("Escape closes the palette", async () => {
      await page.keyboard.press("Escape");
      await gone(palette());
    }, 30_000);

    test("reopening starts fresh: empty query, first action selected", async () => {
      await page.keyboard.press("ControlOrMeta+k");
      await see(palette());
      expect(await page.locator(".command-input").inputValue()).toBe("");
      await see(
        page.locator('.command-item[data-selected="true"]', {
          hasText: "Refresh repository",
        }),
      );
    }, 30_000);

    test("typing filters and selection follows the matches", async () => {
      await page.keyboard.type("working");
      await see(
        page.locator('.command-item[data-selected="true"]', {
          hasText: "View working copy",
        }),
      );
      // Only matching items remain visible.
      expect(
        await page.locator(".command-item:visible").count(),
      ).toBeLessThan(3);
    }, 30_000);

    test("Enter runs the selected action and closes the palette", async () => {
      await page.keyboard.press("Enter");
      await gone(palette());
      await see(page.locator(".diff-label", { hasText: "working copy" }));
    }, 30_000);

    test("disabled actions are skipped by keyboard selection", async () => {
      await page.keyboard.press("ControlOrMeta+k");
      await see(palette());
      // Walk the whole list; selection must never land on a disabled item.
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press("ArrowDown");
        const current = page.locator(
          '.command-item[data-selected="true"]',
        );
        await see(current);
        expect(await current.getAttribute("data-disabled")).not.toBe("true");
      }
      await page.keyboard.press("Escape");
      await gone(palette());
    }, 30_000);

    test("comment drafts take focus, block ⌘K, and cancel on Escape", async () => {
      // The working copy is empty by now; feat-b has c.txt to comment on.
      await page.locator(".segment-header", { hasText: "feat-b" }).click();
      const card = page.locator('.file-card[data-file="c.txt"]');
      await see(card);
      await card.locator("div[data-gutter]").first().click();
      const draft = page.locator(".comment-input");
      await see(draft);

      // The draft textarea is focused on open (Pierre adopts annotation
      // nodes into its shadow DOM after mount, which used to drop focus),
      // so typing lands in it without a click.
      await page.waitForTimeout(100);
      await page.keyboard.type("wip");
      expect(await draft.inputValue()).toBe("wip");

      await page.keyboard.press("ControlOrMeta+k");
      await page.waitForTimeout(300);
      expect(await palette().count()).toBe(0);

      // Escape cancels the draft instead of touching modals.
      await page.keyboard.press("Escape");
      await gone(draft);
    }, 30_000);
  });
});

async function expectFocusedPaletteInput(): Promise<void> {
  const focused = await page.evaluate(
    () => document.activeElement?.className ?? "",
  );
  expect(focused).toContain("command-input");
}
