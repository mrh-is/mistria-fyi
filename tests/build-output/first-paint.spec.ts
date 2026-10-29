import { Window } from "happy-dom";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { preview } from "vite";

import type { PreviewServer } from "vite";

/**
 * Issue #66 reported unstyled rectangles flashing in the upper-left on reload. A flash like that
 * needs a first paint without the page’s CSS, which happens when a stylesheet is neither in the
 * document’s head nor render-blocking (a `<link>` after `<body>` content, or `media="print"`
 * swapped in by script). The reload could not be reproduced on the
 * prerendered build in Chromium or WebKit, so this pins the property that rules those causes out.
 */

/** What keeps `link` from blocking the first paint, or `undefined` when it blocks. */
function nonBlockingReason(link: {
  getAttribute: (name: string) => null | string;
  hasAttribute: (name: string) => boolean;
}): string | undefined {
  const media = link.getAttribute("media");
  if (media !== null && !["", "all", "screen"].includes(media.trim())) {
    return "has a media attribute";
  }
  if (link.hasAttribute("disabled")) return "is disabled";
  if (link.hasAttribute("blocking") && link.getAttribute("blocking") !== "render") {
    return "is not render-blocking";
  }
  return undefined;
}

/** Why the page’s first paint can precede its CSS, one message per problem. */
function firstPaintProblems(html: string): { hrefs: string[]; problems: string[] } {
  const window = new Window({
    settings: { disableJavaScriptFileLoading: true, enableJavaScriptEvaluation: false },
  });
  try {
    window.document.write(html);
    const { document } = window;
    const problems: string[] = [];
    const hrefs: string[] = [];
    const sheets = [...document.querySelectorAll('link[rel~="stylesheet"]')];
    if (sheets.length === 0) problems.push("no stylesheet link");
    for (const sheet of sheets) {
      const href = sheet.getAttribute("href") ?? "(no href)";
      hrefs.push(href);
      if (!document.head.contains(sheet)) problems.push(`${href} is outside <head>`);
      const reason = nonBlockingReason(sheet);
      if (reason !== undefined) problems.push(`${href} ${reason}`);
    }
    return { hrefs, problems };
  } finally {
    void window.happyDOM.close();
  }
}

const htmlPage = (head: string, body = "<p>hi</p>"): string =>
  `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;

const problemsOf = (html: string): string[] => firstPaintProblems(html).problems;

void describe("first-paint detector", () => {
  void test("accepts render-blocking head stylesheets & collects their hrefs", () => {
    assert.deepEqual(
      firstPaintProblems(
        htmlPage('<link href="./a.css" rel="stylesheet" media="all"><script>1</script>'),
      ),
      { hrefs: ["./a.css"], problems: [] },
    );
  });

  void test("rejects a page with no stylesheet", () => {
    assert.deepEqual(problemsOf(htmlPage("<title>x</title>")), ["no stylesheet link"]);
  });

  void test("rejects a stylesheet placed in the body", () => {
    assert.deepEqual(
      problemsOf(
        htmlPage(
          '<link href="./a.css" rel="stylesheet">',
          '<link href="./b.css" rel="stylesheet">',
        ),
      ),
      ["./b.css is outside <head>"],
    );
  });

  void test("rejects a stylesheet deferred with a print media swap", () => {
    assert.deepEqual(problemsOf(htmlPage('<link href="./a.css" rel="stylesheet" media="print">')), [
      "./a.css has a media attribute",
    ]);
  });
});

void describe("built first paint", { timeout: 120_000 }, () => {
  let server: PreviewServer | undefined;
  let origin: string;
  let paths: string[];

  before(
    async () => {
      server = await preview({ preview: { host: "127.0.0.1", open: false, port: 0 } });
      const address = server.httpServer.address();
      assert.ok(address !== null && typeof address !== "string");
      origin = `http://127.0.0.1:${String(address.port)}`;
      const response = await fetch(`${origin}/sitemap.xml`, {
        signal: AbortSignal.timeout(10_000),
      });
      assert.ok(response.ok);
      const sitemap = await response.text();
      paths = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(
        ([, location]) => new URL(location).pathname,
      );
    },
    { timeout: 30_000 },
  );

  after(
    async () => {
      await server?.close();
    },
    { timeout: 10_000 },
  );

  void test("every page’s stylesheets are render-blocking in its head & resolve", async () => {
    assert.ok(paths.length > 0);
    const failures: string[] = [];
    for (const path of paths) {
      const response = await fetch(`${origin}${path}`, {
        headers: { accept: "text/html", "accept-language": "en-US" },
        signal: AbortSignal.timeout(10_000),
      });
      assert.ok(response.ok, `${path}: HTTP ${String(response.status)}`);
      const html = await response.text();
      const { hrefs, problems } = firstPaintProblems(html);
      for (const problem of problems) failures.push(`${path}: ${problem}`);
      assert.ok(hrefs.length > 0, `${path}: no stylesheet to fetch`);
      // Each href is relative to the page, so a trailing-slash or nesting mistake breaks it here.
      for (const href of hrefs) {
        const sheet = await fetch(new URL(href, response.url), {
          signal: AbortSignal.timeout(10_000),
        });
        if (!sheet.ok || !(sheet.headers.get("content-type") ?? "").includes("text/css")) {
          failures.push(`${path}: ${href} did not load as CSS`);
        }
      }
    }
    assert.deepEqual(failures, []);
  });
});
