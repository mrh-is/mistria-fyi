import { tick } from "svelte";
import { afterEach, describe, expect, it } from "vitest";

import CosmeticsContent from "#lib/components/cosmetics-content.svelte";
import { userState } from "#lib/stores/user-state.svelte.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";

afterEach(() => {
  userState.resetAll();
});

describe("CosmeticsContent", () => {
  // Its section progress is a new object on every render, which once made sections re-report their
  // shelf forever & froze the page.
  it("settles after sorting sections whose progress is rebuilt on each render", async () => {
    const view = renderWithFeedback(CosmeticsContent, { locale: "en" });
    await tick();

    expect(view.getByRole("heading", { level: 2, name: "To do" })).toBeInTheDocument();
  });
});
