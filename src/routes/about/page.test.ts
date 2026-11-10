import { describe, expect, it } from "vitest";
import toRuntime from "wuchale/runtime";

import { trackerData } from "#lib/data/index.js";
import { pageMetadata } from "#lib/data/page-metadata.js";
import { loadAboutCatalog } from "#lib/i18n/about-ui.js";
import { renderToFragment } from "#lib/test-utils/render-to-fragment.js";
import * as m from "#lib/ui-messages/messages.js";

import AboutPage from "./+page.svelte";
import { aboutMetadata } from "./about-metadata.js";

describe("about and legal page", () => {
  it("keeps links and icons attached to their translated sentences", async () => {
    const aboutCatalog = await loadAboutCatalog("zh-Hant");
    const metadata = pageMetadata(aboutMetadata(toRuntime(aboutCatalog, "zh-Hant")));
    expect(metadata.title).toBe("關於");
    expect(metadata.description).toBe("了解非官方的 Fields of Mistria 田野指南。");
    const { queries } = renderToFragment(AboutPage, {
      props: {
        data: {
          aboutCatalog,
          locale: "zh-Hant",
          metadata,
        },
      },
    });
    const studio = queries.getByRole("link", { name: "NPC Studio" });
    expect(studio.getAttribute("href")).toBe("https://www.npcstudio.com/");
    expect(studio.closest("p")?.textContent).toContain("它與 NPC Studio 沒有隸屬");
    const contact = queries.getByRole("link", { name: "私下聯絡我" });
    expect(contact.getAttribute("href")).toBe("mailto:michael@mistria.fyi");
    expect(contact.closest("p")?.querySelector(".feedback-icon")).not.toBeNull();
  });

  it("states the project’s identity, ownership boundary, data version, and contact", async () => {
    const aboutCatalog = await loadAboutCatalog("en");
    const { container, queries, text } = renderToFragment(AboutPage, {
      props: {
        data: {
          aboutCatalog,
          locale: "en",
          metadata: pageMetadata({ description: "About the Field Guide", title: "About" }),
        },
      },
    });

    expect(text).toContain("independent, unofficial, & noncommercial fan project");
    expect(text).toContain("affiliated with, endorsed by, supported by, or sponsored by");
    expect(text).toMatch(/progress in\s+Fields of Mistria\./u);
    expect(text).toMatch(/maintained by\s+Michael Helmbrecht\./u);
    expect(text).toMatch(/sponsored by\s+NPC Studio\s+\(though, call me!\)\./u);
    expect(queries.getByRole("link", { name: "NPC Studio" }).getAttribute("href")).toBe(
      "https://www.npcstudio.com/",
    );
    expect(text).toContain("all the content therein");
    expect(text).toContain(`game version ${trackerData.version}`);
    expect(text).toContain("briefly be out of date");
    expect(container.querySelector("a[href='mailto:michael@mistria.fyi']")).not.toBeNull();
    expect(container.querySelector(".feedback-icon")).not.toBeNull();
    expect(queries.getByRole("link", { name: "Privacy" })).toBeTruthy();
    expect(queries.getByRole("button", { name: "AI disclosure" })).toBeTruthy();
    expect(
      queries.getByRole("link", { name: m.page_header_back_to_home() }).getAttribute("href"),
    ).toBe("/en");
  });
});
