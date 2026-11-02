import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { SourceMap } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { createBuilder } from "vite";
import { expect, it } from "vitest";

import type { SourceMapPayload } from "node:module";

it("maps CSS URL substitutions when only the server environment enables sourcemaps", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mistria-css-map-"));
  try {
    await writeFile(
      path.join(root, "entry.js"),
      'export { default as css } from "./style.css?url";\nexport function fixture() { throw new Error("map marker"); }',
    );
    await writeFile(path.join(root, "style.css"), "body { color: red; }");
    const warnings: string[] = [];
    const builder = await createBuilder({
      builder: { sharedConfigBuild: true },
      configFile: false,
      environments: {
        ssr: {
          build: {
            rolldownOptions: {
              input: path.join(root, "entry.js"),
              onLog: (level, log) => {
                if (level === "warn") warnings.push(log.code ?? "unknown");
              },
            },
            sourcemap: true,
            write: false,
          },
          consumer: "server",
        },
      },
      logLevel: "silent",
      root,
    });
    const output = await builder.build(builder.environments.ssr);
    expect("output" in output).toBe(true);
    if (!("output" in output)) throw new Error("Expected a single build output");
    const chunks = output.output.filter((file) => file.type === "chunk");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].code).toContain("style-");
    expect(chunks[0].map?.mappings).toBeTruthy();
    const marker = chunks[0].code.indexOf('new Error("map marker")');
    expect(marker).toBeGreaterThan(0);
    const before = chunks[0].code.slice(0, marker).split("\n");
    const map = JSON.parse(chunks[0].map?.toString() ?? "{}") as SourceMapPayload;
    const origin = new SourceMap(map).findOrigin(before.length, (before.at(-1)?.length ?? 0) + 1);
    if (!("fileName" in origin)) throw new Error("CSS URL substitution lost the fixture's mapping");
    expect(origin.fileName.replaceAll("\\", "/")).toMatch(/\/entry\.js$/u);
    expect(origin.lineNumber).toBe(2);
    expect(warnings).not.toContain("SOURCEMAP_BROKEN");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

it.each([
  { expected: { forceColor: "1" }, forceColor: undefined, noColor: undefined },
  { expected: { noColor: "" }, forceColor: undefined, noColor: "" },
  { expected: { noColor: "1" }, forceColor: undefined, noColor: "1" },
  { expected: { forceColor: "0" }, forceColor: "0", noColor: undefined },
  { expected: { forceColor: "3" }, forceColor: "3", noColor: undefined },
])(
  "preserves NO_COLOR=$noColor & FORCE_COLOR=$forceColor in SvelteKit's build workers",
  async ({ expected, forceColor, noColor }) => {
    const root = await mkdtemp(path.join(tmpdir(), "mistria-worker-color-"));
    try {
      const module = path.join(root, "worker.mjs");
      const fork = new URL("../utils/fork.js", import.meta.resolve("@sveltejs/kit")).href;
      await writeFile(
        module,
        `import { forked } from ${JSON.stringify(fork)};
      export const run = forked(import.meta.url, async () => ({
        noColor: process.env.NO_COLOR, forceColor: process.env.FORCE_COLOR
      }));`,
      );
      const env = { ...process.env };
      delete env.FORCE_COLOR;
      delete env.NO_COLOR;
      if (noColor !== undefined) env.NO_COLOR = noColor;
      if (forceColor !== undefined) env.FORCE_COLOR = forceColor;
      const runner = path.join(root, "runner.mjs");
      await writeFile(
        runner,
        `import { run } from ${JSON.stringify(pathToFileURL(module).href)};
       console.log(JSON.stringify(await run({})));`,
      );
      const { stderr, stdout } = await promisify(execFile)(process.execPath, [runner], { env });
      expect(JSON.parse(stdout.trim())).toEqual(expected);
      expect(stderr).not.toContain("NO_COLOR");
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  },
);
