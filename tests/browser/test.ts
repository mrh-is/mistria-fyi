import { test as base, expect } from "@playwright/test";
import { readdirSync, readFileSync } from "node:fs";

import { PRODUCTION_ASSET_ORIGIN } from "../../src/lib/asset-origin.js";
import dimensions from "./fixtures/sprite-dimensions.json" with { type: "json" };

import type { BrowserContext, Request } from "@playwright/test";

const spriteDimensions: Readonly<Record<string, null | string>> = dimensions;
const sprites = new Map<string, Buffer>();
const fontDirectory = new URL("../../src/lib/fonts/", import.meta.url);
const fallbackFonts = new Set([
  `${PRODUCTION_ASSET_ORIGIN}/fonts/satoshi-regular.woff2`,
  ...readdirSync(fontDirectory)
    .filter((name) => name.endsWith(".css"))
    .flatMap((name) =>
      [...readFileSync(new URL(name, fontDirectory), "utf8").matchAll(/url\((https:[^)]+)\)/g)].map(
        ([, url]) => url,
      ),
    ),
]);
const turnstileUrl = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
for (const size of new Set(Object.values(spriteDimensions))) {
  if (size !== null) {
    sprites.set(size, readFileSync(new URL(`fixtures/${size}.webp`, import.meta.url)));
  }
}

export { expect } from "@playwright/test";

/** Installs before any page opens, including pages created by the service-worker tests. */
export async function isolateNetwork(
  context: BrowserContext,
  baseURL: string,
): Promise<() => string[]> {
  const origin = new URL(baseURL).origin;
  const external = new Map<Request, string>();
  const sockets = new Set<string>();
  const observe = (request: Request): void => {
    const url = new URL(request.url());
    if (["http:", "https:"].includes(url.protocol) && url.origin !== origin) {
      external.set(request, request.url());
    }
  };
  context.on("request", observe);
  // Cached frame requests never reach routing; the worker's actual fetch does, and remains
  // subject to the same guard. Context routing also covers popups and additional tabs.
  context.on("response", (response) => {
    if (response.fromServiceWorker()) external.delete(response.request());
  });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin) {
      await route.continue();
      return;
    }
    if (url.origin === PRODUCTION_ASSET_ORIGIN) {
      const key = /^\/sprites\/(items|villagers)\/([^/]+)\.webp$/.exec(url.pathname);
      const size = key ? spriteDimensions[`${key[1]}/${key[2]}`] : undefined;
      if (size !== undefined) {
        await route.fulfill({
          body: size === null ? "" : sprites.get(size),
          contentType: "image/webp",
          headers: { "access-control-allow-origin": "*" },
          status: size === null ? 404 : 200,
        });
        external.delete(request);
        return;
      }
      // Satoshi cannot be redistributed; locale fonts are large. Exercise system-font fallback.
      if (fallbackFonts.has(url.href)) {
        await route.abort();
        external.delete(request);
        return;
      }
    }
    if (url.href === turnstileUrl) {
      await route.fulfill({
        body: readFileSync(new URL("fixtures/turnstile.js", import.meta.url)),
        contentType: "text/javascript",
      });
      external.delete(request);
      return;
    }
    await route.abort();
  });
  await context.routeWebSocket(/.*/, async (socket) => {
    sockets.add(socket.url());
    await socket.close();
  });
  return () => [...external.values(), ...sockets];
}

export const test = base.extend<{ networkIsolation: undefined }>({
  networkIsolation: [
    async ({ baseURL, context }, use) => {
      if (baseURL === undefined) throw new Error("Browser tests require a local baseURL");
      const unexpectedRequests = await isolateNetwork(context, baseURL);
      await use(undefined);
      expect(unexpectedRequests(), "Unexpected internet requests; add a local fixture").toEqual([]);
    },
    { auto: true },
  ],
});
