import { describe, expect, it } from "vitest";

import { firefoxLaunchEnv } from "#scripts/lib/playwright-firefox";

describe("firefoxLaunchEnv", () => {
  it("points CoreFoundation's home at the throwaway folder on macOS", () => {
    expect(firefoxLaunchEnv("darwin", { PATH: "/usr/bin" }, "/tmp/home")).toEqual({
      CFFIXED_USER_HOME: "/tmp/home",
      PATH: "/usr/bin",
    });
  });

  it("leaves the environment alone elsewhere", () => {
    const env = { PATH: "/usr/bin" };
    expect(firefoxLaunchEnv("linux", env, "/tmp/home")).toBe(env);
    expect(firefoxLaunchEnv("win32", env, "/tmp/home")).toBe(env);
  });
});
