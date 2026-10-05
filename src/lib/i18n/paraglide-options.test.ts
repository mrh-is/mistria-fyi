import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import * as runtime from "#lib/paraglide/runtime.js";

import { PARAGLIDE_OPTIONS, UNLOCALIZED_PATH_PREFIXES } from "./paraglide-options.js";

const packageJson = JSON.parse(
  readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
) as { scripts: Record<string, string> };

describe("PARAGLIDE_OPTIONS", () => {
  it("is what the compiled runtime was built with", () => {
    expect(runtime.strategy).toEqual(PARAGLIDE_OPTIONS.strategy);
    expect(runtime.routeStrategies).toEqual(PARAGLIDE_OPTIONS.routeStrategies);
    expect(runtime.urlPatterns).toEqual(PARAGLIDE_OPTIONS.urlPatterns);
  });

  it("is also what the standalone compile uses", () => {
    // The Paraglide CLI takes only a few options as flags, so it would compile a runtime with the
    // default strategy & URL patterns. The compile script passes the shared options instead.
    expect(packageJson.scripts["paraglide:compile"]).toBe("tsx scripts/paraglide-compile.ts");
  });

  it.each(["/api", "/api/feedback", "/sitemap.xml"])("excludes %s from localization", (path) => {
    expect(runtime.isExcludedByRouteStrategy(`https://mistria.fyi${path}`)).toBe(true);
  });

  it.each(["/", "/en/almanac", "/apiary", "/sitemap.xml.bak"])("localizes %s", (path) => {
    expect(runtime.isExcludedByRouteStrategy(`https://mistria.fyi${path}`)).toBe(false);
  });

  it("excludes every unlocalized prefix", () => {
    expect(PARAGLIDE_OPTIONS.routeStrategies.map((route) => route.match)).toEqual(
      UNLOCALIZED_PATH_PREFIXES.map((prefix) => `${prefix}/:path(.*)?`),
    );
  });
});
