import { describe, expect, it, vi } from "vitest";

const environment = vi.hoisted(() => ({ browser: false }));

vi.mock("$app/env", () => environment);

const { load, prerender } = await import("./+page.js");

/** A load event whose URL throws on `search`, as SvelteKit's does while prerendering. */
function prerenderingEvent(pathname: string) {
  const url = new URL(`https://mistria-fyi.test${pathname}`);
  Object.defineProperty(url, "search", {
    get() {
      throw new Error("url.search is unavailable while prerendering");
    },
  });
  return { parent: () => Promise.resolve({ locale: "ja" as const }), url };
}

describe("legacy settings route", () => {
  it("prerenders", () => {
    expect(prerender).toBe(true);
  });

  it("renders a placeholder on the server without reading the query", async () => {
    environment.browser = false;
    const data = await load(prerenderingEvent("/ja/settings") as never);
    expect(data).toMatchObject({ metadata: { robots: "noindex, follow", toolbar: "hidden" } });
  });

  it("redirects to data management in the browser and preserves deep links", async () => {
    environment.browser = true;
    const event = {
      parent: () => Promise.resolve({ locale: "ja" as const }),
      url: new URL("https://mistria-fyi.test/ja/settings?section=transfer"),
    };
    await expect(load(event as never)).rejects.toMatchObject({
      location: "/ja/data?section=transfer",
      status: 308,
    });
  });
});
