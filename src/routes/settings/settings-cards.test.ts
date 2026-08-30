import { render } from "svelte/server";
import { afterEach, describe, expect, it } from "vitest";

import { userState } from "$lib/stores/user-state.svelte.js";

import BackupCard from "./backup-card.svelte";
import DangerZoneCard from "./danger-zone-card.svelte";
import ImportCard from "./import-card.svelte";
import SpoilersCard from "./spoilers-card.svelte";
import TransferCard from "./transfer-card.svelte";

function expectCollapsed(body: string, summary: string) {
  expect(body).toContain('aria-expanded="false"');
  expect(body).toContain(summary);
}

afterEach(() => {
  userState.resetAll();
});

describe("settings cards", () => {
  it("summarizes the current spoiler visibility", () => {
    const hidden = render(SpoilersCard, { props: { open: false } });
    expectCollapsed(hidden.body, "Spoilers are hidden");

    userState.toggleShowSpoilers();

    const shown = render(SpoilersCard, { props: { open: false } });
    expectCollapsed(shown.body, "Spoilers are shown");
  });

  it("summarizes save import while collapsed", () => {
    const { body } = render(ImportCard, { props: { open: false } });

    expectCollapsed(body, "Import progress from a Fields of Mistria save.");
  });

  it("summarizes device transfer while collapsed", () => {
    const { body } = render(TransferCard, { props: { open: false } });

    expectCollapsed(body, "Move progress between devices with a QR code.");
  });

  it("summarizes backup and restore while collapsed", () => {
    const { body } = render(BackupCard, { props: { open: false } });

    expectCollapsed(body, "Export or restore all tracker data.");
  });

  it("summarizes the danger zone while collapsed", () => {
    const { body } = render(DangerZoneCard, { props: { open: false } });

    expectCollapsed(body, "Erase all tracked progress.");
  });
});
