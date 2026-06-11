#!/usr/bin/env bun
/**
 * Dev tool: drive a headless system Chrome against a running jiffy server,
 * dump console errors, and save screenshots to /tmp/jiffy-*.png.
 *
 *   bun scripts/screenshot.ts [url]
 */
import { chromium } from "playwright-core";

const url = process.argv[2] ?? "http://localhost:5959";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

const errors: string[] = [];
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

// Not networkidle: the SSE keepalive pings every 2s, so the network never
// goes idle.
await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForSelector(".diff-header", { timeout: 15000 });
await page.waitForTimeout(1500); // let diffs highlight
await page.screenshot({ path: "/tmp/jiffy-home.png" });

// Click the first named segment in the stack, if present.
const segment = page.locator(".segment-header").first();
if (await segment.count()) {
  await segment.click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "/tmp/jiffy-segment.png" });
}

// Try opening a comment draft on the first visible line number gutter.
const lineNumber = page
  .locator("[data-line-number], .line-number, [class*='lineNumber']")
  .first();

console.log(JSON.stringify({ errors }, null, 2));
await browser.close();
