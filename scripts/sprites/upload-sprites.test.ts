import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { uploadSprites } from "#scripts/sprites/upload-sprites";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("uploadSprites", () => {
  it("fails when nothing is staged", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(uploadSprites(path.join(tmpdir(), "mistria-no-such-sprites"))).resolves.toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("No staged sprites"));
  });

  it("refuses to upload anything that isn't a converted .webp sprite", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "mistria-sprites-"));
    directories.push(directory);
    mkdirSync(path.join(directory, "items"));
    writeFileSync(path.join(directory, "items", "ok.webp"), "");
    writeFileSync(path.join(directory, "items", "original.png"), "");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetch = vi.spyOn(globalThis, "fetch");

    await expect(uploadSprites(directory)).resolves.toBe(1);

    expect(error).toHaveBeenCalledWith(expect.stringContaining("Refusing to upload"));
    expect(error).toHaveBeenCalledWith(path.join(directory, "items/original.png"));
    expect(fetch).not.toHaveBeenCalled();
  });
});
