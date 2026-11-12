import { afterEach, describe, expect, it, vi } from "vitest";

import { userState } from "#lib/stores/user-state.svelte.js";
import { renderToFragmentWithFeedback } from "#lib/test-utils/render-to-fragment-with-feedback.js";
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
    const { container, text } = renderToFragmentWithFeedback(ImportCard, {
      props: { open: false },
    });

    expect(
      container.querySelector("[data-slot='collapsible-trigger']")?.getAttribute("aria-expanded"),
    ).toBe("false");
    expect(text).toContain("Import progress from a Fields of Mistria save.");
  });

  it("summarizes device transfer while collapsed", () => {
    const { container, text } = renderToFragment(TransferCard, {
      props: { onOpenBackup: vi.fn(), open: false },
    });

    expect(
      container.querySelector("[data-slot='collapsible-trigger']")?.getAttribute("aria-expanded"),
    ).toBe("false");
    expect(text).toContain("Take your progress to another device.");
  });

  it("summarizes backup and restore while collapsed", () => {
    const { container, text } = renderToFragment(BackupCard, { props: { open: false } });

    expect(
      container.querySelector("[data-slot='collapsible-trigger']")?.getAttribute("aria-expanded"),
    ).toBe("false");
    expect(text).toContain("Export or restore all your field guide data.");
  });

  it("summarizes the danger zone while collapsed", () => {
    const { container, text } = renderToFragment(DangerZoneCard, { props: { open: false } });

    expect(
      container.querySelector("[data-slot='collapsible-trigger']")?.getAttribute("aria-expanded"),
    ).toBe("false");
    expect(text).toContain("Erase all tracked progress.");
  });
});
