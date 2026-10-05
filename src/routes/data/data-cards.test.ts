import { render } from "svelte/server";
import { afterEach, describe, expect, it } from "vitest";

import { userState } from "#lib/stores/user-state.svelte.js";

import BackupCard from "./backup-card.svelte";
import DangerZoneCard from "./danger-zone-card.svelte";
import ImportCard from "./import-card.svelte";
import TransferCard from "./transfer-card.svelte";

afterEach(() => {
  userState.resetAll();
});

describe("data cards", () => {
  it("summarizes save import while collapsed", () => {
    const { body } = render(ImportCard, { props: { open: false } });

    expect(body).toContain('aria-expanded="false"');
    expect(body).toContain("Import progress from a Fields of Mistria save.");
  });

  it("summarizes device transfer while collapsed", () => {
    const { body } = render(TransferCard, { props: { open: false } });

    expect(body).toContain('aria-expanded="false"');
    expect(body).toContain("Move progress between devices with a QR code.");
  });

  it("summarizes backup and restore while collapsed", () => {
    const { body } = render(BackupCard, { props: { open: false } });

    expect(body).toContain('aria-expanded="false"');
    expect(body).toContain("Export or restore all tracker data.");
  });

  it("summarizes the danger zone while collapsed", () => {
    const { body } = render(DangerZoneCard, { props: { open: false } });

    expect(body).toContain('aria-expanded="false"');
    expect(body).toContain("Erase all tracked progress.");
  });
});
