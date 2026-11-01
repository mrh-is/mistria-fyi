import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

import { comparePixels, createVisualReport, visualCases } from "./visual-diff.js";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("visual-diff pilot", () => {
  it("highlights changed pixels & counts alpha changes without hiding small differences", () => {
    const before = new Uint8Array([0, 0, 0, 255, 100, 100, 100, 255, 0, 0, 0, 255]);
    const after = new Uint8Array([1, 0, 0, 255, 100, 100, 100, 255, 0, 0, 0, 254]);
    const result = comparePixels(before, after);
    expect(result.changedPixels).toBe(2);
    expect(result.totalPixels).toBe(3);
    expect([...result.image]).toEqual([255, 0, 255, 255, 224, 224, 224, 255, 255, 0, 255, 255]);
    expect(comparePixels(before, before).changedPixels).toBe(0);
    expect(() => comparePixels(before, new Uint8Array(3))).toThrow("equally sized");
  });

  it("creates six labeled sheets & distinguishes a missing capture from a stable match", async () => {
    const directory = mkdtempSync(join(tmpdir(), "visual-diff-"));
    directories.push(directory);
    for (const revision of ["base", "head"]) {
      mkdirSync(join(directory, revision));
    }
    await Promise.all(
      ["base", "head"].flatMap((revision) =>
        [0, 1].map((repeat) =>
          sharp({
            create: {
              background: revision === "head" && repeat === 1 ? "#fff" : "#000",
              channels: 4,
              height: 720,
              width: 390,
            },
          })
            .png()
            .toFile(join(directory, revision, `home-light-390-${repeat}.png`)),
        ),
      ),
    );
    const results = await createVisualReport(directory);
    expect(results.map((entry) => entry.id)).toEqual([
      "home-light-1280",
      "home-light-390",
      "home-dark-1280",
      "home-dark-390",
      "almanac-light-1280",
      "almanac-light-390",
      "almanac-dark-1280",
      "almanac-dark-390",
    ]);
    expect(results[1]).toMatchObject({ changedPixels: 0, noisePixels: 280_800 });
    expect(results[0]).toMatchObject({ changedPixels: null, noisePixels: null });
    await Promise.all(
      ["home", "almanac"].flatMap((route) =>
        ["before", "after", "difference"].map(async (kind) => {
          expect(
            await sharp(join(directory, "report", `${route}-${kind}.png`)).metadata(),
          ).toMatchObject({ height: 1504, width: 1686 });
        }),
      ),
    );
    expect(readFileSync(join(directory, "report", "report.md"), "utf8")).toContain(
      "Capture failed",
    );
    expect(JSON.parse(readFileSync(join(directory, "report", "metrics.json"), "utf8"))).toEqual(
      results,
    );
  });

  it("rejects dimension drift instead of comparing different layouts silently", async () => {
    const directory = mkdtempSync(join(tmpdir(), "visual-size-"));
    directories.push(directory);
    mkdirSync(join(directory, "base"));
    await sharp({ create: { background: "#fff", channels: 4, height: 720, width: 391 } })
      .png()
      .toFile(join(directory, "base", `${visualCases[1].id}-0.png`));
    await expect(createVisualReport(directory)).rejects.toThrow("Unexpected capture dimensions");
  });
});
