import { fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { beforeAll, describe, expect, it } from "vitest";

import { pageMetadata } from "#lib/data/page-metadata.js";
import { loadAboutCatalog } from "#lib/i18n/about-ui.js";

import AboutPage from "./+page.svelte";

describe("About page navigation and disclosures", () => {
  let aboutCatalog: Awaited<ReturnType<typeof loadAboutCatalog>>;
  const metadata = pageMetadata({ description: "About the Field Guide", title: "About" });

  beforeAll(async () => {
    aboutCatalog = await loadAboutCatalog("en");
  });

  it("links the header arrow to home", () => {
    render(AboutPage, { data: { aboutCatalog, locale: "en", metadata } });
    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/en");
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

    const dialog = await screen.findByRole("dialog", { name: "Built with AI assistance" });
    const close = within(dialog).getByRole("button", { name: "Close" });
    expect(within(dialog).getAllByRole("button", { name: /close/iu })).toHaveLength(1);
    await fireEvent.click(close);
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
  });

  it("renders the AI disclosure in the About catalog's locale", async () => {
    const spanishCatalog = await loadAboutCatalog("es");
    render(AboutPage, { data: { aboutCatalog: spanishCatalog, locale: "es", metadata } });

    await fireEvent.click(screen.getByRole("button", { name: "Divulgación sobre IA" }));

    expect(await screen.findByRole("heading", { name: "Creado con ayuda de IA" })).toBeVisible();
    expect(screen.getByRole("link", { name: "escribirme" })).toHaveAttribute(
      "href",
      "mailto:michael@mistria.fyi",
    );
  });
});
