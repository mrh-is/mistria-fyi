import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { checkRoutes, isFunctionRoute, matchesRoute } from "./check-routes.js";

describe("matchesRoute", () => {
  it("matches exact paths", () => {
    expect(matchesRoute("/robots.txt", "/robots.txt")).toBe(true);
    expect(matchesRoute("/robots.txt", "/robots.txt.bak")).toBe(false);
  });

  it("lets a splat span nested directories", () => {
    expect(matchesRoute("/sprites/*", "/sprites/spr_ui_item_zzz.webp")).toBe(true);
    expect(matchesRoute("/sprites/*", "/sprites/nested/deep.webp")).toBe(true);
    expect(matchesRoute("/sprites/*", "/sprite/x.webp")).toBe(false);
  });

  it("treats regex metacharacters in patterns literally", () => {
    expect(matchesRoute("/_app/version.json", "/_app/versionXjson")).toBe(false);
  });
});

describe("isFunctionRoute", () => {
  const routes = { exclude: ["/sprites/*", "/fonts/*"], include: ["/*"] };

  it("routes excluded assets away from the Function", () => {
    expect(isFunctionRoute(routes, "/sprites/a.webp")).toBe(false);
    expect(isFunctionRoute(routes, "/fonts/a.woff2")).toBe(false);
  });

  it("keeps dynamic pages and the feedback API on the Function", () => {
    expect(isFunctionRoute(routes, "/en/almanac")).toBe(true);
    expect(isFunctionRoute(routes, "/api/feedback")).toBe(true);
  });
});

describe("checkRoutes", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "check-routes-"));
    await mkdir(path.join(dir, "sprites"), { recursive: true });
    await mkdir(path.join(dir, "fonts"), { recursive: true });
    await writeFile(path.join(dir, "_worker.js"), "");
    await writeFile(path.join(dir, "404.html"), "");
    await writeFile(path.join(dir, "robots.txt"), "");
    await writeFile(path.join(dir, "sprites", "spr_a.webp"), "");
    await writeFile(path.join(dir, "sprites", "spr_zzz_last.webp"), "");
    await writeFile(path.join(dir, "fonts", "body.woff2"), "");
  });

  afterEach(async () => {
    await rm(dir, { force: true, recursive: true });
  });

  it("passes when wildcard rules cover every asset", async () => {
    await writeRoutes(dir, ["/robots.txt", "/sprites/*", "/fonts/*"]);
    expect(await checkRoutes(dir)).toEqual({ htmlAssets: [], ruleCount: 4, unexcludedAssets: [] });
  });

  it("reports assets past a truncated per-file list", async () => {
    await writeRoutes(dir, ["/robots.txt", "/sprites/spr_a.webp"]);
    const report = await checkRoutes(dir);
    expect(report.unexcludedAssets).toEqual(["/fonts/body.woff2", "/sprites/spr_zzz_last.webp"]);
  });

  it("ignores Pages-internal files", async () => {
    await writeRoutes(dir, ["/robots.txt", "/sprites/*", "/fonts/*"]);
    const report = await checkRoutes(dir);
    expect(report.unexcludedAssets).not.toContain("/_worker.js");
    expect(report.unexcludedAssets).not.toContain("/404.html");
    expect(report.htmlAssets).toEqual([]);
  });

  it("reports .html assets, which Pages redirects away from their own path", async () => {
    await writeFile(path.join(dir, "offline.html"), "");
    await writeRoutes(dir, ["/robots.txt", "/offline.html", "/sprites/*", "/fonts/*"]);
    const report = await checkRoutes(dir);
    expect(report.htmlAssets).toEqual(["/offline.html"]);
  });
});

async function writeRoutes(dir: string, exclude: string[]) {
  await writeFile(
    path.join(dir, "_routes.json"),
    JSON.stringify({ exclude, include: ["/*"], version: 1 }),
  );
}
