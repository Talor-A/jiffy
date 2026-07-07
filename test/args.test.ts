import { describe, expect, test } from "bun:test";
import { parseCli } from "../lib/args";

describe("parseCli --wait", () => {
  test("defaults to undefined", () => {
    expect(parseCli([]).wait).toBeUndefined();
  });
  test("--wait sets true, --no-wait sets false", () => {
    expect(parseCli(["--wait"]).wait).toBe(true);
    expect(parseCli(["--no-wait"]).wait).toBe(false);
  });
  test("unknown flags still throw", () => {
    expect(() => parseCli(["--wat"])).toThrow();
  });
});
