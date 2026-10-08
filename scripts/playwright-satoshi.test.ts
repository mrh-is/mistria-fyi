import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ensureSatoshi } from "./playwright-satoshi.js";

const directories: string[] = [];

function fontPath(): string {
  const directory = mkdtempSync(join(tmpdir(), "playwright-satoshi-"));
  directories.push(directory);
  return join(directory, "local", "satoshi-regular.woff2");
}

function rejectFetch(): Promise<Response> {
  return Promise.reject(new Error("unexpected fetch"));
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("browser-suite Satoshi", () => {
  it("fails a download that doesn't match the pinned hash without writing it", async () => {
    const path = fontPath();
    await expect(
      ensureSatoshi(path, () => Promise.resolve(new Response("not the font"))),
    ).rejects.toThrow("expected 5aa97d93");
    expect(existsSync(path)).toBe(false);
  });

  it("fails clearly when the download fails", async () => {
    await expect(
      ensureSatoshi(fontPath(), () => Promise.resolve(new Response("", { status: 503 }))),
    ).rejects.toThrow("HTTP 503");
  });

  it("verifies an existing copy instead of refetching it", async () => {
    const path = fontPath();
    mkdirSync(dirname(path));
    writeFileSync(path, "tampered");
    await expect(ensureSatoshi(path, rejectFetch)).rejects.toThrow(`Satoshi from ${path}`);
  });
});
