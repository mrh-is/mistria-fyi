import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderToFragment } from "#lib/test-utils/render-to-fragment.js";

import DataPage from "./+page.svelte";

const appState = vi.hoisted(() => ({
  url: new URL("https://mistria-fyi.test/data"),
}));

// Under the `app` project's `isolate: false`, a component module cached by this file keeps this
// mock for later files in the same worker, so it carries every field the shared stand-in in
// src/vitest-setup-app-state.ts does.
vi.mock("$app/state", () => ({
  page: {
    data: { locale: "en" },
    status: 200,
    get url() {
      return appState.url;
    },
  },
}));

function disclosureState(container: HTMLElement, title: string): null | string | undefined {
  const triggers = container.querySelectorAll("[data-slot='collapsible-trigger']");
  return [...triggers]
    .find((trigger) => trigger.textContent.includes(title))
    ?.getAttribute("aria-expanded");
}

beforeEach(() => {
  appState.url = new URL("https://mistria-fyi.test/data");
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
    appState.url = new URL("https://mistria-fyi.test/data?section=transfer");

    const { container } = renderToFragment(DataPage, { props: {} });

    expect(disclosureState(container, "Import from Save File")).toBe("false");
    expect(disclosureState(container, "Transfer to Another Device")).toBe("true");
  });
});
