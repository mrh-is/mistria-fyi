import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { renderToFragment } from "#lib/test-utils/render-to-fragment.js";

import PrivacyPage from "./+page.svelte";

describe("privacy policy", () => {
  it("includes the AI in development section", () => {
    const { queries, text } = renderToFragment(PrivacyPage, { props: {} });

    expect(queries.getByRole("heading", { name: "AI in development" })).toBeTruthy();
    expect(text).toContain("AI coding tools");
    expect(text).toContain("AI tools never get your email address");
    expect(text).toContain("save file sync log");
    expect(text).not.toContain("any information about how you use the app");
    expect(queries.getByRole("link", { name: "Back to About" }).getAttribute("href")).toBe(
      "/en/about",
    );
  });

  it("shows when the policy last changed", () => {
    const { text } = renderToFragment(PrivacyPage, { props: {} });

    expect(text).toMatch(/Last updated November 5, 2026/u);
  });

  it("says what feedback is for & how long a reply address is kept", () => {
    const { text } = renderToFragment(PrivacyPage, { props: {} });

    expect(text).toContain("used only to fix the app");
    expect(text).toContain("it isn’t shared with anyone");
    expect(text).toContain("never used to optimize engagement");
    expect(text).toContain("deleted automatically after 90 days");
  });
});

describe("privacy disclosure drift", () => {
  it("app.html makes no automatic requests to undisclosed third parties", () => {
    const appHtml = readFileSync(resolve(import.meta.dirname, "../../app.html"), "utf8");

    // Google Fonts or any external font service would constitute an
    // automatic third-party request that the privacy policy must disclose.
    expect(appHtml).not.toMatch(/fonts\.googleapis\.com/);
    expect(appHtml).not.toMatch(/fonts\.gstatic\.com/);
    expect(appHtml).not.toMatch(/use\.typekit\.net/);
    expect(appHtml).not.toMatch(/fast\.fonts\.net/);
  });
});
