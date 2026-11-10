import { fireEvent, render, screen } from "@testing-library/svelte";
import { beforeAll, describe, expect, it } from "vitest";

import { pageMetadata } from "#lib/data/page-metadata.js";
import { loadAboutCatalog } from "#lib/i18n/about-ui.js";
import * as m from "#lib/ui-messages/messages.js";

import AboutPage from "./+page.svelte";

describe("About page navigation and disclosures", () => {
  let aboutCatalog: Awaited<ReturnType<typeof loadAboutCatalog>>;
  const metadata = pageMetadata({ description: "About the Field Guide", title: "About" });

  beforeAll(async () => {
    aboutCatalog = await loadAboutCatalog("en");
  });

  it("links the header arrow to home", () => {
    render(AboutPage, { data: { aboutCatalog, locale: "en", metadata } });
    expect(screen.getByRole("link", { name: m.page_header_back_to_home() })).toHaveAttribute(
      "href",
      "/en",
    );
  });

  it("links the generated open-source license notices from the About footer", () => {
    render(AboutPage, { data: { aboutCatalog, locale: "en", metadata } });

    expect(screen.getByRole("link", { name: "Open-source licenses" })).toHaveAttribute(
      "href",
      "/licenses.txt",
    );
  });

  it("opens the AI disclosure from the About footer", async () => {
    render(AboutPage, { data: { aboutCatalog, locale: "en", metadata } });

    await fireEvent.click(screen.getByRole("button", { name: "AI disclosure" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(m.ai_disclosure_title())).toBeInTheDocument();
  });
});
