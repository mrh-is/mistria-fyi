import { describe, expect, it, vi } from "vitest";

import { bareLocaleRedirect } from "./hooks.server";

import type { RequestEvent } from "@sveltejs/kit";

function makeEvent(
  path: string,
  { acceptLanguage, cookie }: { acceptLanguage?: string; cookie?: string } = {},
): RequestEvent {
  const headers = new Headers();
  if (acceptLanguage) headers.set("accept-language", acceptLanguage);

  return {
    cookies: { get: () => cookie },
    request: new Request(`https://mistria-fyi.test${path}`, { headers }),
    url: new URL(`https://mistria-fyi.test${path}`),
  } as unknown as RequestEvent;
}

const PASS_THROUGH = new Response("pass-through");

describe("bareLocaleRedirect", () => {
  it("passes through a path that already has a locale prefix", async () => {
    const resolve = vi.fn().mockResolvedValue(PASS_THROUGH);
    const response = await bareLocaleRedirect({
      event: makeEvent("/en/almanac"),
      resolve,
    });

    expect(resolve).toHaveBeenCalledOnce();
    expect(response).toBe(PASS_THROUGH);
  });

  it("passes through /api and /sitemap.xml unmodified", async () => {
    const resolve = vi.fn().mockResolvedValue(PASS_THROUGH);

    await bareLocaleRedirect({ event: makeEvent("/api/feedback"), resolve });
    await bareLocaleRedirect({ event: makeEvent("/sitemap.xml"), resolve });

    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it("redirects a bare path to the cookie-preferred locale", async () => {
    const resolve = vi.fn();
    const response = await bareLocaleRedirect({
      event: makeEvent("/almanac", { cookie: "fr" }),
      resolve,
    });

    expect(resolve).not.toHaveBeenCalled();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/fr/almanac");
  });

  it("falls back to Accept-Language negotiation when there is no cookie", async () => {
    const response = await bareLocaleRedirect({
      event: makeEvent("/almanac", { acceptLanguage: "ja" }),
      resolve: vi.fn(),
    });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/ja/almanac");
  });

  it("prefers the cookie over Accept-Language when both are present", async () => {
    const response = await bareLocaleRedirect({
      event: makeEvent("/almanac", { acceptLanguage: "ja", cookie: "es" }),
      resolve: vi.fn(),
    });

    expect(response.headers.get("location")).toBe("/es/almanac");
  });

  it("ignores a cookie value that isn't a supported locale", async () => {
    const response = await bareLocaleRedirect({
      event: makeEvent("/almanac", { acceptLanguage: "ko", cookie: "not-a-locale" }),
      resolve: vi.fn(),
    });

    expect(response.headers.get("location")).toBe("/ko/almanac");
  });

  it("redirects the bare root path to /<locale>, not /<locale>/", async () => {
    const response = await bareLocaleRedirect({
      event: makeEvent("/", { cookie: "ru" }),
      resolve: vi.fn(),
    });

    expect(response.headers.get("location")).toBe("/ru");
  });

  it("preserves the query string on redirect", async () => {
    const response = await bareLocaleRedirect({
      event: makeEvent("/data?section=transfer", { cookie: "en" }),
      resolve: vi.fn(),
    });

    expect(response.headers.get("location")).toBe("/en/data?section=transfer");
  });

  it("falls back to English when neither a cookie nor Accept-Language yields a supported locale", async () => {
    const withoutHeader = await bareLocaleRedirect({
      event: makeEvent("/almanac"),
      resolve: vi.fn(),
    });
    const unsupportedLanguage = await bareLocaleRedirect({
      event: makeEvent("/", { acceptLanguage: "tlh" }),
      resolve: vi.fn(),
    });

    expect(withoutHeader.status).toBe(307);
    expect(withoutHeader.headers.get("location")).toBe("/en/almanac");
    expect(unsupportedLanguage.headers.get("location")).toBe("/en");
  });

  it("marks the redirect as varying by the inputs that choose its locale", async () => {
    const response = await bareLocaleRedirect({
      event: makeEvent("/almanac", { cookie: "fr" }),
      resolve: vi.fn(),
    });

    expect(response.headers.get("vary")).toBe("Cookie, Accept-Language");
  });
});
