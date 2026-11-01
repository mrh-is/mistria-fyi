import { firefox } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Browser, LaunchOptions } from "@playwright/test";

/**
 * Returns the environment Playwright's Firefox needs on `platform`. On macOS, Firefox's profile
 * service reads `~/Library/Application Support/Firefox` even when Playwright passes its own
 * profile. TCC denies that folder to processes without Full Disk Access, so Firefox exits with
 * “Could not find profile folder” (#287). `CFFIXED_USER_HOME` points CoreFoundation's home at
 * `home` instead. Other platforms get `env` unchanged.
 */
export function firefoxLaunchEnv(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  home: string,
): NodeJS.ProcessEnv {
  return platform === "darwin" ? { ...env, CFFIXED_USER_HOME: home } : env;
}

/**
 * Launches Playwright's Firefox with a stand-in CoreFoundation home. Use this instead of
 * `firefox.launch()` in ad-hoc verification scripts. Every launch reuses one home in the temp
 * directory: macOS protects the folders Firefox creates there from other processes, so nothing
 * else can delete them, and a fresh home per launch would pile up.
 */
export async function launchFirefox(options: LaunchOptions = {}): Promise<Browser> {
  const home = join(tmpdir(), "mistria-firefox-home");
  mkdirSync(home, { recursive: true });
  return firefox.launch({
    ...options,
    env: firefoxLaunchEnv(process.platform, options.env ?? process.env, home),
  });
}
