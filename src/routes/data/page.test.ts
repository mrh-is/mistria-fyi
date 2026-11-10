import { beforeEach, describe, expect, it } from "vitest";

import { trackerData } from "#lib/data/index.js";
import * as m from "#lib/paraglide/messages.js";
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

    expect(text).toContain(m.data_title());
    expect(text).toContain(m.data_field_kit_heading());
    for (const title of [
      m.import_card_title(),
      m.transfer_card_title(),
      m.backup_card_title(),
      m.danger_zone_title(),
    ]) {
      expect(disclosureState(container, title)).toBeDefined();
    }
    expect(text).toContain(`Fields of Mistria v${trackerData.version}`);
    expect(container.querySelector("a[href='/about']")).toBeNull();
    expect(container.querySelector("a[href='/privacy']")).toBeNull();
    expect(text).not.toContain(m.toolbar_send_feedback());
    expect(text).not.toContain("AI disclosure");
  });

  // The page is prerendered, so the server never sees `?section=`; the browser opens the tool.
  it("renders deep-linked tools closed on the server", () => {
    pageStub.navigate("/en/data?section=transfer");

    const { container } = renderToFragmentWithFeedback(DataPage, { props: {} });

    expect(disclosureState(container, m.import_card_title())).toBe("false");
    expect(disclosureState(container, m.transfer_card_title())).toBe("false");
  });
});
