import { afterEach, describe, expect, it } from "vitest";

import { userState } from "#lib/stores/user-state.svelte.js";
import { renderToFragment } from "#lib/test-utils/render-to-fragment.js";

import BackupCard from "./backup-card.svelte";
import DangerZoneCard from "./danger-zone-card.svelte";
import ImportCard from "./import-card.svelte";
import TransferCard from "./transfer-card.svelte";

afterEach(() => {
  userState.resetAll();
});

describe("data cards", () => {
  it("summarizes save import while collapsed", () => {
    const { container, text } = renderToFragment(ImportCard, { props: { open: false } });

    expect(
      container.querySelector("[data-slot='collapsible-trigger']")?.getAttribute("aria-expanded"),
    ).toBe("false");
    expect(text).toContain("Import progress from a Fields of Mistria save.");
  });

  it("summarizes device transfer while collapsed", () => {
    const { container, text } = renderToFragment(TransferCard, { props: { open: false } });

    expect(
      container.querySelector("[data-slot='collapsible-trigger']")?.getAttribute("aria-expanded"),
    ).toBe("false");
    expect(text).toContain("Move progress between devices with a QR code.");
  });

  it("summarizes backup and restore while collapsed", () => {
    const { container, text } = renderToFragment(BackupCard, { props: { open: false } });

    expect(
      container.querySelector("[data-slot='collapsible-trigger']")?.getAttribute("aria-expanded"),
    ).toBe("false");
    expect(text).toContain("Export or restore all tracker data.");
  });

  it("summarizes the danger zone while collapsed", () => {
    const { container, text } = renderToFragment(DangerZoneCard, { props: { open: false } });

    expect(
      container.querySelector("[data-slot='collapsible-trigger']")?.getAttribute("aria-expanded"),
    ).toBe("false");
    expect(text).toContain("Erase all tracked progress.");
  });
});
