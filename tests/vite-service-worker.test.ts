import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

describe("service worker registration", () => {
  it.each([
    ["serve", "development", false],
    ["serve", "production", false],
    ["build", "production", true],
    ["build", "development", true],
  ] as const)(
    "uses %s rather than the %s mode to choose registration",
    async (command, mode, expected) => {
      // Resolve the real config in a separate process: SvelteKit’s config hooks set globals under
      // Vitest, which must not leak into other files in the shared Node test project.
      const { stdout } = await promisify(execFile)(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `import { resolveConfig } from "vite";
       const config = await resolveConfig({}, ${JSON.stringify(command)}, ${JSON.stringify(mode)});
       console.log(config.define.__SVELTEKIT_SERVICE_WORKER__);`,
        ],
        { cwd: new URL("..", import.meta.url) },
      );

      expect(stdout.trim()).toBe(String(expected));
    },
  );
});
