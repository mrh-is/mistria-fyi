import { beforeEach, describe, expect, it } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { pageStub } from "#lib/test-utils/page-stub.svelte.js";
import { renderToFragmentWithFeedback } from "#lib/test-utils/render-to-fragment-with-feedback.js";

import DataPage from "./+page.svelte";

function disclosureState(container: HTMLElement, title: string): null | string | undefined {
  const triggers = container.querySelectorAll("[data-slot='collapsible-trigger']");
  return [...triggers]
    .find((trigger) => trigger.textContent.includes(title))
    ?.getAttribute("aria-expanded");
}

beforeEach(() => {
  pageStub.reset();
  pageStub.navigate("/en/data");
});

describe("data management page", () => {
  it("collects transfer, backup, and reset tools in the Field kit", () => {
    const { container, text } = renderToFragmentWithFeedback(DataPage, { props: {} });

    expect(text).toContain("Data management");
    expect(text).toContain("Field kit");
    for (const title of [
      "Import from save file",
      "Transfer to another device",
      "Backup & restore",
      "Danger zone",
    ]) {
      expect(disclosureState(container, title)).toBeDefined();
    }
    expect(text).toContain(`Fields of Mistria v${trackerData.version}`);
    expect(container.querySelector("a[href='/about']")).toBeNull();
    expect(container.querySelector("a[href='/privacy']")).toBeNull();
    expect(text).not.toContain("Send feedback");
    expect(text).not.toContain("AI disclosure");
  });

  // The page is prerendered, so the server never sees `?section=`; the browser opens the tool.
  it("renders deep-linked tools closed on the server", () => {
    pageStub.navigate("/en/data?section=transfer");

    const { container } = renderToFragmentWithFeedback(DataPage, { props: {} });

    expect(disclosureState(container, "Import from save file")).toBe("false");
    expect(disclosureState(container, "Transfer to another device")).toBe("false");
  });
});
