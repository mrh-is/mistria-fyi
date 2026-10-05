import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "svelte/server";
import { describe, expect, it } from "vitest";

import PrivacyPage from "./+page.svelte";

describe("privacy policy", () => {
  it("includes the AI in development section", () => {
    const { body } = render(PrivacyPage, { props: {} });

    expect(body).toContain("AI in development");
    expect(body).toContain("AI coding tools");
    expect(body).toContain("your email address");
    expect(body).toContain('href="/en/about"');
    expect(body).toContain('aria-label="Back to About"');
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
