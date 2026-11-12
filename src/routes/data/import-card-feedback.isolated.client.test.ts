import { fireEvent, screen, within } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { userState } from "#lib/stores/user-state.svelte.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";

import ImportCard from "./import-card.svelte";

import type * as ImportSave from "#lib/engine/import-save.js";

// The archive reader only throws `SavArchiveError` for the failures it recognizes; anything else is
// the unexpected case this file covers, so the mock stays out of the main import tests.
vi.mock("#lib/engine/import-save.js", async (importOriginal) => ({
  ...(await importOriginal<typeof ImportSave>()),
  unpackSavFile: vi.fn(() => Promise.reject(new RangeError(`offset "Hollyhock" is out of bounds`))),
}));

beforeEach(async () => {
  await userState.startTrackingByHand();
});

describe("an unreadable save the archive reader doesn't recognize", () => {
  it("links to the feedback form with the error & its redacted details as the draft", async () => {
    const { feedbackContext } = renderWithFeedback(ImportCard, { open: true });
    await fireEvent.change(screen.getByLabelText("Choose save files to import"), {
      target: { files: [new File([new Uint8Array([1])], "game-1-autosave.sav")] },
    });

    const alert = await screen.findByRole("alert");
    const errorMessage = `We couldn’t read that save file. Try the newest file that ends in “autosave”. If that one doesn’t work either, send us feedback and we’ll look into it.`;
    expect(alert).toHaveTextContent(errorMessage);
    expect(feedbackContext.errorReportRequest).toBeUndefined();

    await fireEvent.click(within(alert).getByRole("button", { name: "send us feedback" }));

    const draft = feedbackContext.errorReportRequest?.message;
    const details = "Technical details: RangeError: offset [redacted] is out of bounds";
    expect(draft).toBe(`${errorMessage}\n\n${details}`);
  });
});
