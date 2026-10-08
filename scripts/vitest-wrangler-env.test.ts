import { existsSync, rmSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { configureVitestWranglerEnv } from "./vitest-wrangler-env.js";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function configure(env: NodeJS.ProcessEnv): string | undefined {
  const directory = configureVitestWranglerEnv(env);
  if (directory) directories.push(directory);
  return directory;
}

describe("Vitest Wrangler environment", () => {
  it.each([undefined, "false"])("leaves non-test environments unchanged (%s)", (vitest) => {
    const env = { VITEST: vitest };
    expect(configure(env)).toBeUndefined();
    expect(env).toEqual({ VITEST: vitest });
  });

  it("creates writable, isolated defaults for logs & the worker registry", () => {
    const env: NodeJS.ProcessEnv = { VITEST: "true" };
    const directory = configure(env);
    expect(directory).toBeDefined();
    if (directory === undefined) throw new Error("Expected a temporary Wrangler directory");
    expect(isAbsolute(directory)).toBe(true);
    expect(existsSync(directory)).toBe(true);
    expect(env.XDG_CONFIG_HOME).toBe(join(directory, "config"));
    expect(env.WRANGLER_LOG_PATH).toBe(join(directory, "logs"));
    expect(configure({ VITEST: "true" })).not.toBe(directory);
  });

  it.each(["XDG_CONFIG_HOME", "WRANGLER_LOG_PATH"])("preserves an explicit %s", (key) => {
    const env: NodeJS.ProcessEnv = { [key]: "/custom/path", VITEST: "true" };
    expect(configure(env)).toBeDefined();
    expect(env[key]).toBe("/custom/path");
  });

  it("inherits configured paths without allocating another directory", () => {
    const env: NodeJS.ProcessEnv = { VITEST: "true" };
    configure(env);
    const inherited = { ...env };
    expect(configure(inherited)).toBeUndefined();
    expect(inherited).toEqual(env);
  });
});
