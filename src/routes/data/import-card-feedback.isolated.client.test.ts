import { fireEvent, screen, within } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as m from "#lib/paraglide/messages.js";
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
    await fireEvent.change(screen.getByLabelText(m.import_file_input_aria()), {
      target: { files: [new File([new Uint8Array([1])], "game-1-autosave.sav")] },
    });

    const alert = await screen.findByRole("alert");
    const errorMessage = m.import_error_parse_failed({
      feedback: m.import_error_feedback_link(),
      tryAutosave: m.import_error_try_autosave(),
    });
    expect(alert).toHaveTextContent(errorMessage);
    expect(feedbackContext.errorReportRequest).toBeUndefined();

    await fireEvent.click(
      within(alert).getByRole("button", { name: m.import_error_feedback_link() }),
    );

    const draft = feedbackContext.errorReportRequest?.message;
    const details = m.import_error_feedback_details({
      details: "RangeError: offset [redacted] is out of bounds",
    });
    expect(draft).toBe(`${errorMessage}\n\n${details}`);
  });
});
