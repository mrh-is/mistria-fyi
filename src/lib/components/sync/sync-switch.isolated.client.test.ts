import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { readFileSync } from "node:fs";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { memoryStorage } from "#lib/test-utils/memory-storage.js";
import { pageStub } from "#lib/test-utils/page-stub.svelte.js";

/**
 * Nothing from the receiver reaches the production site before launch (#291). Each surface renders
 * with the switch on & off, against a device that has every reason to show it.
 */
const enabled = vi.hoisted(() => ({ syncEnabled: true }));
vi.mock("#lib/sync/enabled.js", () => ({
  get syncEnabled() {
    return enabled.syncEnabled;
  },
}));
vi.mock("$app/state", () => import("#lib/test-utils/page-stub.svelte.js"));
vi.mock("$app/navigation", () => ({ afterNavigate: vi.fn(), goto: vi.fn() }));

const PROGRESS_KEY = "mistria-fyi:progress";
const KEY = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
const NOW = Date.UTC(2026, 9, 31, 12);
const DAY = 86_400_000;

function document_(): string {
  const progress = {
    almanac: [],
    animalCosmetics: {},
    animals: {},
    cosmetics: [],
    mineFloor: 0,
    museum: [],
    renown: 0,
    spells: [],
  };
  const worldState = { season: "spring", weather: "calm" };
  const backup = { lastImport: null, progress, version: 3, worldState };
  return JSON.stringify({
    ...backup,
    local: {
      farmSwitchBackup: { backup, farmName: "Old Acres", savedAt: NOW - DAY },
      // Long enough ago that the gap slip would show.
      syncFreshness: { gaps: [], modified: NOW - 5 * DAY },
      syncLane: { key: KEY, kind: "following" },
    },
  });
}

async function loadStore(): Promise<void> {
  vi.stubGlobal("localStorage", memoryStorage({ [PROGRESS_KEY]: document_() }));
  const { userState } = await import("#lib/stores/user-state.svelte.js");
  userState.loadFromStorage();
}

async function renderToolbar(): Promise<void> {
  const [{ default: Harness }, { FeedbackContext }] = await Promise.all([
    import("#lib/components/toolbar-footer.test-harness.svelte"),
    import("#lib/feedback/context.svelte.js"),
  ]);
  render(Harness, {
    feedbackContext: new FeedbackContext(),
    metadata: {
      description: "Test page.",
      title: "Test",
      toolbar: { search: true, worldState: true },
    },
  });
  await tick();
}

async function renderCard(): Promise<void> {
  const { default: BackupCard } = await import("../../../routes/data/backup-card.svelte");
  render(BackupCard, { open: true });
  await tick();
}

beforeEach(() => {
  vi.setSystemTime(NOW);
  pageStub.reset();
  pageStub.navigate("/en");
});

afterEach(async () => {
  cleanup();
  await tick();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the status button", () => {
  it("appears on a syncing device, with its dot & slip after a long gap", async () => {
    enabled.syncEnabled = true;
    await loadStore();
    await renderToolbar();
    const button = screen.getByRole("button", { name: /^Save file sync:/ });
    expect(button).toHaveAccessibleName("Save file sync: no new saves in a while");
    expect(screen.getByText("Haven’t heard from your game in 5 days")).toBeVisible();

    await fireEvent.click(button);
    await tick();
    expect(screen.getByText("Last save file")).toBeVisible();
    expect(button).toHaveAttribute("aria-expanded", "true");

    await fireEvent.click(button);
    await tick();
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("stays off the production site", async () => {
    enabled.syncEnabled = false;
    await loadStore();
    await renderToolbar();
    expect(screen.queryByRole("button", { name: /^Save file sync:/ })).toBeNull();
    expect(screen.queryByText(/Haven’t heard from your game/)).toBeNull();
  });
});

describe("the farm-switch backup", () => {
  it("is offered by name, confirms, & restores", async () => {
    enabled.syncEnabled = true;
    await loadStore();
    await renderCard();
    const offer = screen.getByRole("button", { name: /^Backup of Old Acres, from / });
    await fireEvent.click(offer);
    await tick();
    expect(screen.getByText("Restore this backup?")).toBeVisible();
    await fireEvent.click(screen.getByRole("button", { name: "Restore it" }));
    await tick();
    expect(screen.getAllByText("Restored that backup.").length).toBeGreaterThan(0);
  });

  it("stays off the production site", async () => {
    enabled.syncEnabled = false;
    await loadStore();
    await renderCard();
    expect(screen.queryByRole("button", { name: /^Backup of / })).toBeNull();
    // The ordinary restore is still there.
    expect(screen.getAllByRole("button", { name: /Restore/ }).length).toBeGreaterThan(0);
  });
});

describe("what the switch guards in the page shells", () => {
  // Rendering the root layout or Home here would pull in every category; their one guard is plain.
  it.each([
    ["src/routes/+layout.svelte", "<SyncReceiverHost />"],
    ["src/routes/+page.svelte", "<SyncTroubleNote />"],
  ])("%s mounts it only inside the switch", (path, mount) => {
    const source = readFileSync(path, "utf8");
    const at = source.indexOf(mount);
    expect(at).toBeGreaterThan(-1);
    expect(source.lastIndexOf("{#if syncEnabled}", at)).toBeGreaterThan(-1);
    expect(source.slice(source.lastIndexOf("{#if syncEnabled}", at), at)).not.toContain("{/if}");
  });
});
