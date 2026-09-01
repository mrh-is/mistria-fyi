import { render } from "svelte/server";
import { describe, expect, it } from "vitest";

import PrivacyPage from "./+page.svelte";

describe("privacy policy", () => {
  it("includes the AI in development section", () => {
    const { body } = render(PrivacyPage, { props: {} });

    expect(body).toContain("AI in development");
    expect(body).toContain("AI coding tools");
    expect(body).toContain("your email address");
  });
});
