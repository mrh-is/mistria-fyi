import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import AiDisclosureDialog from "#lib/components/ai-disclosure-dialog.svelte";

afterEach(cleanup);

describe("dialog close button", () => {
  it("is the one localized close control, and it dismisses the dialog", async () => {
    render(AiDisclosureDialog, { open: true });

    // The vendored dialog's own English close button is switched off, so there is exactly one.
    const close = screen.getByRole("button", { name: "Close" });
    expect(screen.getAllByRole("button", { name: /close/iu })).toHaveLength(1);

    await fireEvent.click(close);
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });
});
