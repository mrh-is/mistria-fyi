import { render } from "svelte/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

function disclosureState(body: string, title: string): string | undefined {
  const disclosures = body.matchAll(
    /<button[^>]*data-slot="collapsible-trigger"[^>]*aria-expanded="(true|false)"[^>]*>(.*?)<\/button>/gs,
  );

  for (const disclosure of disclosures) {
    if (disclosure[2].includes(title)) return disclosure[1];
  }
  return undefined;
}

beforeEach(() => {
  appState.url = new URL("https://mistria-fyi.test/data");
});

describe("data management page", () => {
  it("collects transfer, backup, and reset tools in the Field kit", () => {
    const { body } = render(DataPage, { props: {} });

    expect(body).toContain("Data management");
    expect(body).toContain("Field kit");
    expect(body).toContain("Import from Save File");
    expect(body).toContain("Transfer to Another Device");
    expect(body).toContain("Backup &amp; Restore");
    expect(body).toContain("Danger Zone");
    expect(body).toContain("Fields of Mistria v1.0.5");
    expect(body).not.toContain('href="/about"');
    expect(body).not.toContain('href="/privacy"');
    expect(body).not.toContain("Send feedback");
    expect(body).not.toContain("AI disclosure");
  });

  it("opens the requested deep-linked tool", () => {
    appState.url = new URL("https://mistria-fyi.test/data?section=transfer");

    const { body } = render(DataPage, { props: {} });

    expect(disclosureState(body, "Import from Save File")).toBe("false");
    expect(disclosureState(body, "Transfer to Another Device")).toBe("true");
  });
});
