import { Window } from "happy-dom";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { preview } from "vite";

import { SITE_NAME, SITE_ORIGIN } from "../../src/lib/data/page-metadata.js";
import { renderBarePathStub } from "../../src/lib/i18n/bare-path-stub.js";
import { LOCALE_CODES } from "../../src/lib/types/locale.js";

import type { PreviewServer } from "vite";

const HOME_PATH_PATTERN = new RegExp(`^/(?:${LOCALE_CODES.join("|")})$`);

function sitemapLocale(path: string): string | undefined {
  return LOCALE_CODES.find((locale) => path === `/${locale}` || path.startsWith(`/${locale}/`));
}

void describe("built search metadata", { concurrency: 4, timeout: 120_000 }, () => {
  let server: PreviewServer | undefined;
  let origin: string;
  let paths: string[];

  // Node’s suite timeout does not bound hooks. Limit startup & teardown separately, and let
  // check:built’s --test-force-exit release handles left by a timed-out adapter operation.
  before(
    async () => {
      process.stderr.write("[check:built] Starting Vite preview & Cloudflare platform proxy\n");
      // An ephemeral port & a new preview keep this check tied to this checkout’s built output.
      server = await preview({ preview: { host: "127.0.0.1", open: false, port: 0 } });
      const address = server.httpServer.address();
      assert.ok(address !== null && typeof address !== "string");
      origin = `http://127.0.0.1:${String(address.port)}`;
      process.stderr.write(`[check:built] Preview listening at ${origin}; reading sitemap\n`);
      const response = await fetch(`${origin}/sitemap.xml`, {
        signal: AbortSignal.timeout(10_000),
      });
      assert.ok(response.ok);
      const sitemap = await response.text();
      paths = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(
        ([, location]) => new URL(location).pathname,
      );
      process.stderr.write(
        `[check:built] Checking metadata for ${String(paths.length)} sitemap pages\n`,
      );
    },
    { timeout: 30_000 },
  );

  after(
    async () => {
      if (server) {
        process.stderr.write("[check:built] Closing preview & Cloudflare platform proxy\n");
        await server.close();
        process.stderr.write("[check:built] Preview closed\n");
      }
    },
    { timeout: 10_000 },
  );

  async function readPage(path: string): Promise<Window> {
    const response = await fetch(`${origin}${path}`, {
      headers: { accept: "text/html", "accept-language": "en-US" },
      signal: AbortSignal.timeout(10_000),
    });
    assert.ok(response.ok, `${path}: HTTP ${String(response.status)}`);
    const window = new Window({
      settings: {
        disableCSSFileLoading: true,
        disableJavaScriptFileLoading: true,
        enableJavaScriptEvaluation: false,
      },
    });
    window.document.write(await response.text());
    return window;
  }

  void test("the former characters route is not redirected", async () => {
    const response = await fetch(`${origin}/characters`, {
      headers: { accept: "text/html", "accept-language": "en-US" },
      signal: AbortSignal.timeout(10_000),
    });
    assert.equal(response.status, 404);
    assert.match(new URL(response.url).pathname, /\/characters$/);
  });

  void test("every sitemap page is locale-prefixed", () => {
    assert.ok(paths.length > 0);
    assert.deepEqual(
      paths.filter((path) => sitemapLocale(path) === undefined),
      [],
    );
  });

  function registerLocaleTest(locale: string): void {
    void test(`every ${locale} sitemap page has server-rendered search metadata`, async () => {
      const localePaths = paths.filter((path) => sitemapLocale(path) === locale);
      assert.ok(localePaths.length > 0);
      for (const path of localePaths) {
        const window = await readPage(path);
        try {
          const { document } = window;
          const title = document.title;
          if (HOME_PATH_PATTERN.test(path)) assert.equal(title, SITE_NAME, path);
          else assert.match(title, new RegExp(` — ${SITE_NAME}$`), path);
          assert.doesNotMatch(title, /tracker/i, path);
          const metadata = (selector: string, attribute = "content"): string => {
            const elements = document.head.querySelectorAll(selector);
            assert.equal(elements.length, 1, `${path}: ${selector}`);
            const value = elements[0].getAttribute(attribute);
            assert.notEqual(value, null, `${path}: ${selector} ${attribute}`);
            return value ?? "";
          };
          const canonicalUrl = new URL(path, SITE_ORIGIN).href;
          assert.match(metadata('meta[name="description"]'), /Fields of Mistria/, path);
          assert.equal(metadata('link[rel="canonical"]', "href"), canonicalUrl, path);
          const expected = {
            "og:image": `${SITE_ORIGIN}/og-image.png`,
            "og:image:alt":
              "Mistria Field Guide showing an Everything progress stripe at 27% completion.",
            "og:image:height": "630",
            "og:image:type": "image/png",
            "og:image:width": "1200",
            "og:url": canonicalUrl,
          };
          for (const [property, value] of Object.entries(expected)) {
            assert.equal(metadata(`meta[property="${property}"]`), value, `${path}: ${property}`);
          }
          assert.equal(metadata('meta[name="twitter:image"]'), expected["og:image"], path);
          assert.equal(metadata('meta[name="twitter:image:alt"]'), expected["og:image:alt"], path);
          assert.equal(document.head.querySelectorAll('meta[name="robots"]').length, 0, path);
          assert.equal(document.querySelectorAll('main, [role="main"]').length, 1, path);
          assert.equal(
            document.querySelectorAll('h1, [role="heading"][aria-level="1"]').length,
            1,
            path,
          );
        } finally {
          window.close();
        }
      }
    });
  }

  for (const locale of LOCALE_CODES) registerLocaleTest(locale);

  void test("a bare path serves its locale-picking stub", async () => {
    for (const path of ["/", "/data"]) {
      const response = await fetch(`${origin}${path}`, {
        headers: { accept: "text/html" },
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
      });
      assert.equal(response.status, 200, path);
      assert.equal(await response.text(), renderBarePathStub(path), path);
    }
  });

  void test("Data management is rendered but excluded from indexing", async () => {
    const window = await readPage("/en/data");
    try {
      const { document } = window;
      assert.equal(document.title, `Data management — ${SITE_NAME}`);
      assert.equal(
        document.head.querySelector('meta[name="robots"]')?.getAttribute("content"),
        "noindex, follow",
      );
      assert.equal(document.querySelectorAll('main, [role="main"]').length, 1);
      assert.equal(document.querySelector("h1")?.textContent, "Data management");
    } finally {
      window.close();
    }
  });
});
