import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import * as m from "#lib/paraglide/messages.js";

import AboutPage from "./+page.svelte";

describe("About page navigation and disclosures", () => {
  it("links the header arrow to home", () => {
    render(AboutPage);
    expect(screen.getByRole("link", { name: m.page_header_back_to_home() })).toHaveAttribute(
      "href",
      "/en",
    );
  });

  it("links the generated open-source license notices from the About footer", () => {
    render(AboutPage);

    expect(screen.getByRole("link", { name: m.about_licenses_link() })).toHaveAttribute(
      "href",
      "/licenses.txt",
    );
  });

  it("opens the AI disclosure from the About footer", async () => {
    render(AboutPage);

    await fireEvent.click(screen.getByRole("button", { name: m.about_ai_disclosure_link() }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(m.ai_disclosure_title())).toBeInTheDocument();
  });
});
