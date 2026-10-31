import { cleanup, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import { pageStub } from "#lib/test-utils/page-stub.svelte.js";

const enabled = vi.hoisted(() => ({ syncEnabled: true }));
vi.mock("#lib/sync/enabled.js", () => ({
  get syncEnabled() {
    return enabled.syncEnabled;
  },
}));

afterEach(async () => {
  cleanup();
  await tick();
});

async function renderData(): Promise<void> {
  pageStub.reset();
  pageStub.navigate("/en/data");
  const { default: DataPage } = await import("./+page.svelte");
  render(DataPage);
  await tick();
}

describe("Data's sync card", () => {
  it("appears where sync is on", async () => {
    enabled.syncEnabled = true;
    await renderData();
    expect(screen.getByRole("heading", { name: "Save file sync" })).toBeVisible();
    expect(screen.getByRole("button", { name: /Import from Save File/ })).toBeVisible();
  });

  it("stays off the production site until launch", async () => {
    enabled.syncEnabled = false;
    await renderData();
    expect(screen.queryByRole("heading", { name: "Save file sync" })).toBeNull();
    expect(screen.queryByText(/Save file sync/)).toBeNull();
  });
});
