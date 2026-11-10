import { cleanup, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, describe, expect, it } from "vitest";

import { pageStub } from "#lib/test-utils/page-stub.svelte.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";
import * as m from "#lib/ui-messages/messages.js";

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
    expect(screen.getByRole("heading", { name: m.sync_card_title() })).toBeVisible();
    expect(
      screen.getByRole("button", { name: (name) => name.includes(m.import_card_title()) }),
    ).toBeVisible();
  });
});
