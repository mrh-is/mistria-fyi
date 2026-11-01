import "#scripts/lib/require-pinned-node";

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

export const visualCases = ["home", "almanac"].flatMap((route) =>
  (["light", "dark"] as const).flatMap((theme) =>
    [1280, 390].map((width) => ({ id: `${route}-${theme}-${width}`, route, theme, width })),
  ),
);

export interface PixelDifference {
  changedPixels: number;
  image: Buffer;
  totalPixels: number;
}

/** Exact RGBA comparison, deliberately without a tolerance that could hide small changes. */
export function comparePixels(before: Uint8Array, after: Uint8Array): PixelDifference {
  if (before.length !== after.length || before.length % 4 !== 0) {
    throw new Error("Visual comparisons require equally sized RGBA images");
  }
  const image = Buffer.alloc(before.length);
  let changedPixels = 0;
  for (let offset = 0; offset < before.length; offset += 4) {
    const changed = [0, 1, 2, 3].some(
      (channel) => before[offset + channel] !== after[offset + channel],
    );
    if (changed) changedPixels++;
    // Changed pixels are magenta; unchanged pixels are a pale copy of the new capture.
    for (let channel = 0; channel < 3; channel++) {
      const highlight = channel === 1 ? 0 : 255;
      image[offset + channel] = changed
        ? highlight
        : Math.round(after[offset + channel] * 0.2 + 255 * 0.8);
    }
    image[offset + 3] = 255;
  }
  return { changedPixels, image, totalPixels: before.length / 4 };
}

export interface VisualResult {
  changedPixels: null | number;
  id: string;
  noisePixels: null | number;
  totalPixels: number;
}

async function readCapture(path: string, width: number): Promise<Buffer | undefined> {
  if (!existsSync(path)) return undefined;
  const { data, info } = await sharp(path)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.width !== width || info.height !== 720) {
    throw new Error(`Unexpected capture dimensions: ${path}`);
  }
  return data;
}

function placeholder(width: number): Buffer {
  return Buffer.from(
    `<svg width="${width}" height="720"><rect width="100%" height="100%" fill="#eee"/><text x="20" y="50" font-size="20">Capture unavailable</text></svg>`,
  );
}

/** Two columns (desktop & mobile), two rows (light & dark), with labels outside the capture. */
async function sheet(images: (Buffer | undefined)[], path: string): Promise<void> {
  const layers = images.flatMap((input, index) => {
    const width = index % 2 === 0 ? 1280 : 390;
    const top = Math.floor(index / 2) * 752;
    const left = index % 2 === 0 ? 0 : 1296;
    const label = `${index < 2 ? "Light" : "Dark"}, ${width} px`;
    return [
      {
        input: Buffer.from(
          `<svg width="${width}" height="32"><text x="8" y="22" font-size="18">${label}</text></svg>`,
        ),
        left,
        top,
      },
      { input: input ?? placeholder(width), left, top: top + 32 },
    ];
  });
  await sharp({ create: { background: "#fff", channels: 4, height: 1504, width: 1686 } })
    .composite(layers)
    .png()
    .toFile(path);
}

export async function createVisualReport(
  directory: string,
  source?: { baseSha: string; headSha: string },
): Promise<VisualResult[]> {
  const output = join(directory, "report");
  mkdirSync(output, { recursive: true });
  const routeResults = await Promise.all(
    ["home", "almanac"].map(async (route) => {
      const capturesForRoute = await Promise.all(
        visualCases
          .filter((entry) => entry.route === route)
          .map(async (capture) => {
            const captures = await Promise.all(
              ["base", "head"].flatMap((revision) =>
                [0, 1].map((repeat) =>
                  readCapture(
                    join(directory, revision, `${capture.id}-${repeat}.png`),
                    capture.width,
                  ),
                ),
              ),
            );
            const [before, beforeRepeat, after, afterRepeat] = captures;
            const difference = before && after ? comparePixels(before, after) : undefined;
            const noise =
              before && beforeRepeat && after && afterRepeat
                ? Math.max(
                    comparePixels(before, beforeRepeat).changedPixels,
                    comparePixels(after, afterRepeat).changedPixels,
                  )
                : null;
            const encode = (data: Buffer | undefined) =>
              data
                ? sharp(data, { raw: { channels: 4, height: 720, width: capture.width } })
                    .png()
                    .toBuffer()
                : Promise.resolve(undefined);
            const images = await Promise.all(
              [before, after, difference?.image].map((data) => encode(data)),
            );
            return {
              images,
              result: {
                changedPixels: difference?.changedPixels ?? null,
                id: capture.id,
                noisePixels: noise,
                totalPixels: capture.width * 720,
              },
            };
          }),
      );
      await Promise.all(
        ["before", "after", "difference"].map((kind, index) =>
          sheet(
            capturesForRoute.map((entry) => entry.images[index]),
            join(output, `${route}-${kind}.png`),
          ),
        ),
      );
      return capturesForRoute.map((entry) => entry.result);
    }),
  );
  const results = routeResults.flat();
  if (source) {
    if (!/^[a-f\d]{40}$/.test(source.baseSha) || !/^[a-f\d]{40}$/.test(source.headSha)) {
      throw new Error("Invalid capture source");
    }
    writeFileSync(join(output, "source.json"), `${JSON.stringify(source)}\n`);
  }
  writeFileSync(join(output, "metrics.json"), `${JSON.stringify(results, null, 2)}\n`);
  writeFileSync(
    join(output, "report.md"),
    [
      "# Visual-diff pilot",
      "",
      "| State | Changed pixels | Repeat noise (pixels) |",
      "| --- | ---: | ---: |",
      ...results.map(
        (entry) =>
          `| ${entry.id} | ${entry.changedPixels ?? "Capture failed"} | ${entry.noisePixels ?? "Capture failed"} |`,
      ),
      "",
      "Differences & capture failures are informational. Existing accessibility & manual interaction checks remain required.",
      "",
      ...["home", "almanac"].flatMap((route) => [
        `## ${route === "home" ? "Home" : "Almanac"}`,
        "",
        ...["before", "after", "difference"].flatMap((kind) => [
          `![${route}, ${kind}](${route}-${kind}.png)`,
          "",
        ]),
      ]),
    ].join("\n"),
  );
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const results = await createVisualReport(".playwright-artifacts/visual", {
    baseSha: process.env.VISUAL_BASE_SHA ?? "",
    headSha: process.env.VISUAL_HEAD_SHA ?? "",
  });
  console.log(JSON.stringify(results));
  if (results.some((entry) => entry.changedPixels === null || entry.noisePixels === null)) {
    process.exitCode = 1;
  }
}
