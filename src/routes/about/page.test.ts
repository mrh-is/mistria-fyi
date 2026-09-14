import { render } from "svelte/server";
import { describe, expect, it } from "vitest";

import AboutPage from "./+page.svelte";

describe("about and legal page", () => {
  it("states the project’s identity, ownership boundaries, and accuracy limits", () => {
    const { body } = render(AboutPage, { props: {} });

    expect(body).toContain("independent, unofficial, noncommercial fan project");
    expect(body).toContain("not affiliated with, endorsed by, supported by, or sponsored by");
    expect(body).toContain("Michael Helmbrecht");
    expect(body).toContain("original code, interface, organization, and editorial work");
    expect(body).toContain("does not claim ownership of");
    expect(body).toContain("incomplete, inaccurate, or outdated");
    expect(body).toContain("Original game data files are not distributed");
    expect(body).toContain("selected extracted icons");
    expect(body).toContain("generated factual dataset");
    expect(body).toContain("mailto:me@mrh.is");
  });
});
