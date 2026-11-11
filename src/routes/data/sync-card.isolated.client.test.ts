import { cleanup, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, describe, expect, it } from "vitest";

import { pageStub } from "#lib/test-utils/page-stub.svelte.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";

afterEach(async () => {
  cleanup();
  await tick();
});

async function renderData(): Promise<void> {
  pageStub.reset();
  pageStub.navigate("/en/data");
  const { default: DataPage } = await import("./+page.svelte");
  renderWithFeedback(DataPage);
  await tick();
}

describe("Data's sync card", () => {
  it("appears on the Data page", async () => {
    await renderData();
    expect(screen.getByRole("heading", { name: "Save file sync" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: (name) => name.includes("Import from save file") }),
    ).toBeVisible();
  });
});
