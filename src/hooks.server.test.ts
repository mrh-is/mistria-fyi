import { describe, expect, it, vi } from "vitest";

import { renderBarePathStub } from "#lib/i18n/bare-path-stub.js";

import { barePathStub, securityHeaders } from "./hooks.server.js";

import type { RequestEvent } from "@sveltejs/kit";

function makeEvent(path: string): RequestEvent {
  return {
    request: new Request(`https://mistria-fyi.test${path}`),
    url: new URL(`https://mistria-fyi.test${path}`),
  } as unknown as RequestEvent;
}

const PASS_THROUGH = new Response("pass-through");

describe("barePathStub", () => {
  it("passes through a path that already has a locale prefix", async () => {
    const resolve = vi.fn().mockResolvedValue(PASS_THROUGH);
    const response = await barePathStub({
      event: makeEvent("/en/almanac"),
      resolve,
    });

    expect(resolve).toHaveBeenCalledTimes(1);
    expect(response).toBe(PASS_THROUGH);
  });

  it("passes through /api and /sitemap.xml unmodified", async () => {
    const resolve = vi.fn().mockResolvedValue(PASS_THROUGH);

    await barePathStub({ event: makeEvent("/api/feedback"), resolve });
    await barePathStub({ event: makeEvent("/sitemap.xml"), resolve });

    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["/zh-hans/almanac", "/zh-Hans/almanac"],
    ["/ZH-HANT", "/zh-Hant"],
    ["/EN/villagers?x=1", "/en/villagers?x=1"],
  ])("permanently redirects the miscased locale in %s", async (path, location) => {
    const resolve = vi.fn();
    const response = await barePathStub({ event: makeEvent(path), resolve });

    expect(resolve).not.toHaveBeenCalled();
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(location);
  });

  it.each(["/", "/almanac", "/data"])(
    "serves %s the same stub page the static build does",
    async (path) => {
      const resolve = vi.fn();
      const response = await barePathStub({ event: makeEvent(`${path}?q=1`), resolve });

      expect(resolve).not.toHaveBeenCalled();
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
      expect(await response.text()).toBe(renderBarePathStub(path));
    },
  );

  it("leaves an unknown bare path to the not-found page", async () => {
    const resolve = vi.fn().mockResolvedValue(PASS_THROUGH);
    const response = await barePathStub({ event: makeEvent("/characters"), resolve });

    expect(response).toBe(PASS_THROUGH);
  });
});

describe("securityHeaders", () => {
  it("adds the security headers to server-rendered responses", async () => {
    const response = await securityHeaders({
      event: makeEvent("/en/almanac"),
      resolve: vi.fn().mockResolvedValue(new Response("page")),
    });

    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("Permissions-Policy")).toContain("camera=(self)");
    expect(response.headers.get("Strict-Transport-Security")).toBe(
      "max-age=31536000; includeSubDomains",
    );
  });
});
