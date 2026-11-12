import { describe, expect, it } from "vitest";

import * as m from "#lib/paraglide/messages.js";
import { renderToFragment } from "#lib/test-utils/render-to-fragment.js";

import PrivacyPage from "./+page.svelte";

describe("privacy policy", () => {
  it("includes the AI in development section", () => {
    const { queries, text } = renderToFragment(PrivacyPage, { props: {} });

    expect(queries.getByRole("heading", { name: m.privacy_ai_heading() })).toBeTruthy();
    expect(text).toContain("AI coding tools");
    expect(text).toContain("AI tools never get your email address");
    expect(text).toContain("save file sync log");
    expect(text).not.toContain("any information about how you use the app");
    expect(
      queries.getByRole("link", { name: m.page_header_back_to_home() }).getAttribute("href"),
    ).toBe("/en");
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

  it("bolds the public issue & its visibility inside one sentence", () => {
    const { container, text } = renderToFragment(PrivacyPage, { props: {} });

    const bold = [...container.querySelectorAll("strong")].map((node) => node.textContent);
    expect(bold).toEqual(expect.arrayContaining(["public issue", "publicly visible"]));
    expect(text).toContain(
      "is used to create a public issue on the GitHub issue tracker so I can find",
    );
    expect(text).toContain("as these fields will be publicly visible.");
  });
});
