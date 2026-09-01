import { render } from "svelte/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const appState = vi.hoisted(() => ({
  url: new URL("https://mistria-fyi.test/settings"),
}));

vi.mock("$app/state", () => ({
  page: {
    get url() {
      return appState.url;
    },
  },
}));

import SettingsPage from "./+page.svelte";

function disclosureState(body: string, title: string): string | undefined {
  const disclosures = body.matchAll(
    /<button[^>]*data-slot="collapsible-trigger"[^>]*aria-expanded="(true|false)"[^>]*>(.*?)<\/button>/gs,
  );

  for (const disclosure of disclosures) {
    if (disclosure[2].includes(title)) {
      return disclosure[1];
    }
  }
}

beforeEach(() => {
  appState.url = new URL("https://mistria-fyi.test/settings");
});

describe("settings page deep links", () => {
  it("opens only the save import card for an import deep link", () => {
    appState.url = new URL("https://mistria-fyi.test/settings?section=import");

    const { body } = render(SettingsPage, { props: {} });

    expect(disclosureState(body, "Import from Save File")).toBe("true");
    expect(disclosureState(body, "Transfer to Another Device")).toBe("false");
  });

  it("opens only the device transfer card for a transfer deep link", () => {
    appState.url = new URL("https://mistria-fyi.test/settings?section=transfer");

    const { body } = render(SettingsPage, { props: {} });

    expect(disclosureState(body, "Import from Save File")).toBe("false");
    expect(disclosureState(body, "Transfer to Another Device")).toBe("true");
  });
});
