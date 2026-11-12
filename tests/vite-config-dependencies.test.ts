import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";

it("keeps generated modules out of the dev config's restart dependencies", async () => {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { resolveConfig } from "vite";
       const config = await resolveConfig({}, "serve");
       console.log(JSON.stringify(config.configFileDependencies));`,
    ],
    { cwd: new URL("..", import.meta.url) },
  );
  const dependencies = JSON.parse(stdout.trim()) as string[];
  expect(dependencies.some((file) => file.endsWith("/vite.config.ts"))).toBe(true);
  expect(dependencies.some((file) => file.endsWith("/i18n/bare-path-stub.ts"))).toBe(true);
  expect(
    dependencies.filter((file) => /\/(?:i18n\/catalogs\/\.wuchale|\.svelte-kit)\//u.test(file)),
  ).toEqual([]);
});
