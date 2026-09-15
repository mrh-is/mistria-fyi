import { render } from "svelte/server";
import { describe, expect, it } from "vitest";

import AboutPage from "./+page.svelte";

describe("about and legal page", () => {
  it("states the project’s identity, ownership boundary, data version, and contact", () => {
    const { body } = render(AboutPage, { props: {} });

    expect(body).toContain("independent, unofficial, &amp; noncommercial fan project");
    expect(body).toContain("affiliated with, endorsed by, supported by, or sponsored by");
    expect(body).toContain("Michael Helmbrecht");
    expect(body).toContain("all the content therein");
    expect(body).toContain("game version 1.0.2");
    expect(body).toContain("briefly be out of date");
    expect(body).toContain("mailto:michael@mistria.fyi");
    expect(body).toContain("feedback-icon");
  });
});
