import { beforeEach, describe, expect, it, vi } from "vitest";

import { pageStub } from "#lib/test-utils/page-stub.svelte.js";
import { renderToFragment } from "#lib/test-utils/render-to-fragment.js";

import DataPage from "./+page.svelte";

vi.mock("$app/state", () => import("#lib/test-utils/page-stub.svelte.js"));

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
    const { container, text } = renderToFragment(DataPage, { props: {} });

    expect(text).toContain("Data management");
    expect(text).toContain("Field kit");
    for (const title of [
      "Import from Save File",
      "Transfer to Another Device",
      "Backup & Restore",
      "Danger Zone",
    ]) {
      expect(disclosureState(container, title)).toBeDefined();
    }
    expect(text).toContain("Fields of Mistria v1.0.5");
    expect(container.querySelector("a[href='/about']")).toBeNull();
    expect(container.querySelector("a[href='/privacy']")).toBeNull();
    expect(text).not.toContain("Send feedback");
    expect(text).not.toContain("AI disclosure");
  });

  it("opens the requested deep-linked tool", () => {
    pageStub.navigate("/en/data?section=transfer");

    const { container } = renderToFragment(DataPage, { props: {} });

    expect(disclosureState(container, "Import from Save File")).toBe("false");
    expect(disclosureState(container, "Transfer to Another Device")).toBe("true");
  });
});
