import { fireEvent, screen, waitFor, within } from "@testing-library/svelte";
import { tick } from "svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

import FeedbackPanel from "#lib/components/feedback-panel.svelte";
import { FeedbackContext } from "#lib/feedback/context.svelte.js";
import { outlineText } from "#lib/feedback/outline.js";
import * as m from "#lib/paraglide/messages.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { syncDiagnostics } from "#lib/sync/diagnostics.svelte.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";
import { holdTurnstileScripts } from "#lib/test-utils/turnstile-script.js";

const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn(), warning: vi.fn() }));

vi.mock("svelte-sonner", () => ({ toast }));

function mockTurnstile() {
  let widgetId = 0;
  (globalThis as unknown as Record<string, unknown>).turnstile = {
    remove: vi.fn(),
    render: (
      _container: HTMLElement,
      options: { callback: (token: string) => void; sitekey: string },
    ) => {
      options.callback("mock-turnstile-token");
      return String(++widgetId);
    },
    reset: vi.fn(),
  };
}

const progressTitle = () => m.feedback_preview_progress_title();
const syncLogTitle = () => m.feedback_preview_sync_log_title();

/** Opens a preview sheet from its row's Peek slip. */
async function openSheet(slip: string, title: string): Promise<HTMLElement> {
  const form = screen.getByRole("dialog", { name: m.toolbar_send_feedback() });
  await fireEvent.click(within(form).getByRole("button", { name: slip }));
  return screen.findByRole("dialog", { name: title });
}

/** The sheet's outline as a reader would copy it, one line each. */
function sheetText(sheet: HTMLElement): string {
  return [...sheet.querySelectorAll(".preview-sheet__line")]
    .map((line) => line.textContent)
    .join("\n");
}

async function closeSheet(sheet: HTMLElement): Promise<void> {
  await fireEvent.click(within(sheet).getByRole("button", { name: m.common_close() }));
  await waitFor(() => {
    expect(sheet).not.toBeInTheDocument();
  });
}

async function send(message: string): Promise<void> {
  await fireEvent.input(screen.getByRole("textbox", { name: m.feedback_message_label() }), {
    target: { value: message },
  });
  await fireEvent.click(screen.getByRole("button", { name: m.feedback_send_action() }));
}

function requestBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
  return JSON.parse(options.body as string) as Record<string, unknown>;
}

function outcomes(outline: string): string[] {
  return [...outline.matchAll(/outcome: (\S+)/g)].map((match) => match[1]);
}

describe("FeedbackPanel", () => {
  beforeEach(() => {
    toast.mockClear();
    toast.error.mockClear();
    toast.warning.mockClear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    mockTurnstile();
  });

  it("only attaches the previewed sync log when opted in, and can undo the choice", async () => {
    syncDiagnostics.status("unreadable");
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ dryRun: true }));
    vi.stubGlobal("fetch", fetchMock);
    renderWithFeedback(FeedbackPanel, { onClose: vi.fn(), open: true });
    const checkbox = screen.getByRole("checkbox", { name: m.feedback_attach_sync_log() });
    expect(checkbox).not.toBeChecked();
    await fireEvent.click(checkbox);
    const sheet = await openSheet(m.feedback_peek_sync_log_aria(), syncLogTitle());
    const preview = sheetText(sheet);
    expect(preview).toContain("protocolVersion: 1");
    expect(preview).toContain("outcome: unreadable");
    // The sheet's toggle mirrors the row's, and turning it off leaves the sheet open.
    const sheetToggle = within(sheet).getByRole("checkbox", { name: m.feedback_attach_sync_log() });
    expect(sheetToggle).toBeChecked();
    await fireEvent.click(sheetToggle);
    expect(checkbox).not.toBeChecked();
    expect(sheet).toBeInTheDocument();
    await fireEvent.click(sheetToggle);
    expect(checkbox).toBeChecked();
    await closeSheet(sheet);
    await send("Sync trouble");
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const body = requestBody(fetchMock);
    expect(outlineText(body.syncLog)).toBe(preview);
    expect(checkbox).not.toBeChecked();
  });

  it("shows & sends sync events that arrive after opting in", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ dryRun: true }));
    vi.stubGlobal("fetch", fetchMock);
    renderWithFeedback(FeedbackPanel, { onClose: vi.fn(), open: true });
    await fireEvent.click(screen.getByRole("checkbox", { name: m.feedback_attach_sync_log() }));
    const sheet = await openSheet(m.feedback_peek_sync_log_aria(), syncLogTitle());
    const before = outcomes(sheetText(sheet));
    syncDiagnostics.status("write-failed");
    await tick();
    const preview = sheetText(sheet);
    expect(outcomes(preview)).toHaveLength(before.length + 1);
    expect(outcomes(preview).at(-1)).toBe("write-failed");
    await closeSheet(sheet);
    await send("Sync trouble");
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(outlineText(requestBody(fetchMock).syncLog)).toBe(preview);
  });

  it("redacts playtime values in both the progress preview & attachment", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ dryRun: true }));
    vi.stubGlobal("fetch", fetchMock);
    const backup = vi.spyOn(userState, "exportBackup").mockReturnValue(
      JSON.stringify({
        progress: {
          lastSavePlaytime: 4321,
          provenance: { renown: { playtime: 4321, source: "save" } },
          renown: 7,
        },
      }),
    );
    try {
      renderWithFeedback(FeedbackPanel, { onClose: vi.fn(), open: true });
      const expected = {
        lastSavePlaytime: "[redacted]",
        provenance: { renown: { playtime: "[redacted]", source: "save" } },
        renown: 7,
      };
      const sheet = await openSheet(m.feedback_peek_progress_aria(), progressTitle());
      const preview = sheetText(sheet);
      expect(preview).toContain("lastSavePlaytime: [redacted]");
      expect(preview).toContain("    playtime: [redacted]");
      expect(preview).not.toContain("4321");
      await fireEvent.click(
        within(sheet).getByRole("checkbox", { name: m.feedback_attach_progress_label() }),
      );
      await closeSheet(sheet);
      expect(
        screen.getByRole("checkbox", { name: m.feedback_attach_progress_label() }),
      ).toBeChecked();
      await send("A report");
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });
      const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
      const body = options.body as string;
      expect(body).not.toContain("4321");
      const { saveData } = JSON.parse(body) as { saveData: unknown };
      expect(saveData).toEqual(expected);
      expect(outlineText(saveData)).toBe(preview);
    } finally {
      backup.mockRestore();
    }
  });

  it("shows the same marked summary it submits for a large farm", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ dryRun: true }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(userState, "exportBackup").mockReturnValue(
      JSON.stringify({
        progress: {
          almanac: Array.from({ length: 5000 }, (_, i) => `long_game_item_identifier_${String(i)}`),
          provenance: Object.fromEntries(
            Array.from({ length: 4000 }, (_, i) => [
              `almanac/${String(i)}`,
              { playtime: 42, source: "save" },
            ]),
          ),
        },
      }),
    );
    renderWithFeedback(FeedbackPanel, { onClose: vi.fn(), open: true });
    await fireEvent.click(
      screen.getByRole("checkbox", { name: m.feedback_attach_progress_label() }),
    );
    const sheet = await openSheet(m.feedback_peek_progress_aria(), progressTitle());
    const preview = sheetText(sheet);
    expect(preview).toContain(["almanac:", "  count: 5000", "  summarized: true"].join("\n"));
    await closeSheet(sheet);
    await send("A report");
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const body = requestBody(fetchMock);
    expect(body.saveData).toHaveProperty("almanac", { count: 5000, summarized: true });
    expect(outlineText(body.saveData)).toBe(preview);
  });

  it("omits sync diagnostics unless chosen", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ dryRun: true }));
    vi.stubGlobal("fetch", fetchMock);
    renderWithFeedback(FeedbackPanel, { onClose: vi.fn(), open: true });
    expect(screen.getByRole("checkbox", { name: m.feedback_attach_sync_log() })).toBeVisible();
    await send("A report");
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(requestBody(fetchMock)).not.toHaveProperty("syncLog");
  });

  it("hides the sync log row & its card entry when the log isn't offered", async () => {
    renderWithFeedback(FeedbackPanel, { allowSyncLog: false, onClose: vi.fn(), open: true });
    expect(screen.queryByRole("checkbox", { name: m.feedback_attach_sync_log() })).toBeNull();
    await fireEvent.click(screen.getByRole("button", { name: m.feedback_extras_info_aria() }));
    const card = await screen.findByRole("dialog", { name: m.feedback_extras_title() });
    expect(within(card).queryByText(m.feedback_extra_sync_log_name())).toBeNull();
    expect(within(card).getByText(m.feedback_extra_progress_name())).toBeVisible();
  });

  it("previews and attaches progress without player or farm names", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ issueUrl: "https://example.com/issues/1" }));
    vi.stubGlobal("fetch", fetchMock);
    userState.loadFromStorage();
    await userState.mergeFromSave(
      { renown: 7 },
      {
        metadata: {
          farmName: "Private Farm Name",
          identity: { creationVersion: null, saveNumber: "123456" },
          importedAt: Date.now(),
          playerName: "Private Player Name",
        },
      },
    );
    renderWithFeedback(FeedbackPanel, { onClose: vi.fn(), open: true });
    await fireEvent.click(
      screen.getByRole("checkbox", { name: m.feedback_attach_progress_label() }),
    );
    const sheet = await openSheet(m.feedback_peek_progress_aria(), progressTitle());
    const preview = sheetText(sheet);
    expect(preview).toContain("renown: 7");
    expect(preview).not.toContain("Private");
    await closeSheet(sheet);
    await send("Import feedback");
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = options.body as string;
    expect(JSON.parse(body)).toHaveProperty("saveData.renown", 7);
    expect(body).not.toContain("Private");
    expect(body).not.toContain("lastImport");
    userState.resetAll();
  });

  it("renders form fields when open", () => {
    renderWithFeedback(FeedbackPanel, {
      accentColor: "var(--color-category-museum)",
      onClose: vi.fn(),
      open: true,
    });

    const dialog = screen.getByRole("dialog", { name: m.toolbar_send_feedback() });
    expect(dialog).toHaveAttribute(
      "style",
      "--primary: var(--color-category-museum); --ring: var(--color-category-museum);",
    );
    expect(
      screen.getByRole("checkbox", {
        name: (name) => name.includes(m.feedback_wants_reply_label()),
      }),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText(m.feedback_message_placeholder())).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });

  it("renders nothing when closed", () => {
    renderWithFeedback(FeedbackPanel, { onClose: vi.fn(), open: false });

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("sends nothing previewed from a row, the card, or the sheet unless it's switched on", async () => {
    syncDiagnostics.status("unreadable");
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ dryRun: true }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(userState, "exportBackup").mockReturnValue(
      JSON.stringify({ progress: { renown: 7 } }),
    );
    renderWithFeedback(FeedbackPanel, { onClose: vi.fn(), open: true });
    const progress = screen.getByRole("checkbox", { name: m.feedback_attach_progress_label() });
    const syncLog = screen.getByRole("checkbox", { name: m.feedback_attach_sync_log() });
    const reply = screen.getByRole("checkbox", { name: m.feedback_wants_reply_label() });

    // From a row: the preview is readable while the extra stays off.
    let sheet = await openSheet(m.feedback_peek_progress_aria(), progressTitle());
    expect(sheetText(sheet)).toBe("renown: 7");
    expect(within(sheet).getByText(m.feedback_visibility_public())).toBeVisible();
    // From the sheet: switching it on & back off there leaves it off.
    const sheetToggle = within(sheet).getByRole("checkbox", {
      name: m.feedback_attach_progress_label(),
    });
    await fireEvent.click(sheetToggle);
    expect(progress).toBeChecked();
    await fireEvent.click(sheetToggle);
    expect(progress).not.toBeChecked();
    await closeSheet(sheet);

    // From the card: opening it, & peeking from it, turns nothing on.
    await fireEvent.click(screen.getByRole("button", { name: m.feedback_extras_info_aria() }));
    const card = await screen.findByRole("dialog", { name: m.feedback_extras_title() });
    await fireEvent.click(
      within(card).getByRole("button", { name: m.feedback_peek_sync_log_aria() }),
    );
    sheet = await screen.findByRole("dialog", { name: syncLogTitle() });
    expect(sheetText(sheet)).toContain("outcome: unreadable");
    await closeSheet(sheet);
    expect(card).toBeInTheDocument();
    await fireEvent.click(within(card).getByRole("button", { name: m.source_explainer_dismiss() }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: m.feedback_extras_title() })).toBeNull();
    });
    for (const toggle of [progress, syncLog, reply]) expect(toggle).not.toBeChecked();

    await send("Just looking");
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const body = requestBody(fetchMock);
    expect(body).not.toHaveProperty("saveData");
    expect(body).not.toHaveProperty("syncLog");
    expect(body).not.toHaveProperty("email");
  });

  it("says who sees each extra before it's switched on", () => {
    renderWithFeedback(FeedbackPanel, { onClose: vi.fn(), open: true });
    expect(
      screen.getByRole("checkbox", { name: m.feedback_attach_progress_label() }),
    ).toHaveAccessibleDescription(
      `${m.feedback_visibility_public()} ${m.feedback_extra_progress_description()}`,
    );
    expect(
      screen.getByRole("checkbox", { name: m.feedback_attach_sync_log() }),
    ).toHaveAccessibleDescription(
      `${m.feedback_visibility_public()} ${m.feedback_extra_sync_log_description()}`,
    );
  });

  it("says a reply needs a private email, seen only by Michael, before opting in", async () => {
    renderWithFeedback(FeedbackPanel, { onClose: vi.fn(), open: true });
    const reply = screen.getByRole("checkbox", { name: m.feedback_wants_reply_label() });
    expect(reply).not.toBeChecked();
    expect(screen.queryByRole("textbox", { name: m.feedback_email_aria() })).toBeNull();
    expect(reply).toHaveAccessibleDescription(
      `${m.feedback_visibility_private()} ${m.feedback_extra_reply_description()}`,
    );
    expect(m.feedback_extra_reply_description()).toContain("Michael");
    await fireEvent.click(reply);
    const email = screen.getByRole("textbox", { name: m.feedback_email_aria() });
    expect(email).toHaveAccessibleDescription(m.feedback_email_note());
    expect(m.feedback_email_note()).toContain("Michael");
    expect(reply.closest(".extra-row")).toContainElement(email);
  });

  it("closes only the top layer on Escape, and returns focus to its opener", async () => {
    const onClose = vi.fn();
    renderWithFeedback(FeedbackPanel, { onClose, open: true });
    const info = screen.getByRole("button", { name: m.feedback_extras_info_aria() });
    info.focus();
    await fireEvent.click(info);
    const card = await screen.findByRole("dialog", { name: m.feedback_extras_title() });
    const slip = within(card).getByRole("button", { name: m.feedback_peek_progress_aria() });
    slip.focus();
    await fireEvent.click(slip);
    await screen.findByRole("dialog", { name: progressTitle() });

    await fireEvent.keyDown(document.activeElement ?? document, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: progressTitle() })).toBeNull();
    });
    expect(card).toBeInTheDocument();
    await waitFor(() => {
      expect(slip).toHaveFocus();
    });

    await fireEvent.keyDown(document.activeElement ?? document, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: m.feedback_extras_title() })).toBeNull();
    });
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(info).toHaveFocus();
    });
  });

  it("clears email validation when the reply is switched off", async () => {
    renderWithFeedback(FeedbackPanel, { onClose: vi.fn(), open: true });
    const reply = screen.getByRole("checkbox", { name: m.feedback_wants_reply_label() });
    await fireEvent.click(reply);
    await fireEvent.blur(screen.getByRole("textbox", { name: m.feedback_email_aria() }));
    expect(screen.getByRole("textbox", { name: m.feedback_email_aria() })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await fireEvent.click(reply);
    await fireEvent.click(reply);
    expect(screen.getByRole("textbox", { name: m.feedback_email_aria() })).toHaveAttribute(
      "aria-invalid",
      "false",
    );
  });

  it("offers the picker only when enabled and reportable elements exist", async () => {
    const feedbackContext = new FeedbackContext();
    const reportableElement = document.createElement("div");
    document.body.append(reportableElement);
    feedbackContext.reportableAttachment({
      category: "recipe",
      displayName: "Tomato Soup",
      entityId: "tomato_soup",
      page: "/recipes",
    })(reportableElement);

    const view = renderWithFeedback(
      FeedbackPanel,
      {
        onClose: vi.fn(),
        open: true,
        pickerEnabled: true,
      },
      feedbackContext,
    );

    await fireEvent.click(screen.getByRole("button", { name: m.feedback_pick_action() }));
    expect(feedbackContext.isPicking).toBe(true);
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: m.toolbar_send_feedback() })).toBeNull();
    });

    feedbackContext.select({
      category: "recipe",
      displayName: "Tomato Soup",
      entityId: "tomato_soup",
      page: "/recipes",
    });
    expect(await screen.findByText("Tomato Soup")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: m.feedback_change_selection() })).toHaveFocus();
    });

    await fireEvent.click(screen.getByRole("button", { name: m.feedback_clear_selection_aria() }));
    expect(screen.queryByText("Tomato Soup")).toBeNull();

    view.unmount();
    reportableElement.remove();
  });

  it("includes the selected element in the submission payload", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ issueUrl: "https://example.com/issues/1" }));
    vi.stubGlobal("fetch", fetchMock);
    const feedbackContext = new FeedbackContext();
    const reportableElement = document.createElement("div");
    document.body.append(reportableElement);
    feedbackContext.reportableAttachment({
      category: "recipe",
      displayName: "Tomato Soup",
      entityId: "tomato_soup",
      page: "/recipes",
    })(reportableElement);
    renderWithFeedback(
      FeedbackPanel,
      {
        onClose: vi.fn(),
        open: true,
        pickerEnabled: true,
      },
      feedbackContext,
    );

    await fireEvent.click(screen.getByRole("button", { name: m.feedback_pick_action() }));
    feedbackContext.select({
      category: "recipe",
      displayName: "Tomato Soup",
      entityId: "tomato_soup",
      page: "/recipes",
    });
    await fireEvent.input(
      await screen.findByRole("textbox", { name: m.feedback_message_label() }),
      {
        target: { value: "The ingredients are wrong" },
      },
    );
    await fireEvent.click(screen.getByRole("button", { name: m.feedback_send_action() }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(options.body as string)).toMatchObject({
      selectedElement: {
        category: "recipe",
        displayName: "Tomato Soup",
        entityId: "tomato_soup",
        page: "/recipes",
      },
    });
    reportableElement.remove();
  });

  it("prevents submission when the message is empty", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderWithFeedback(FeedbackPanel, { onClose: vi.fn(), open: true });

    const sendButton = screen.getByRole("button", { name: m.feedback_send_action() });
    expect(sendButton).not.toHaveAttribute("aria-disabled");
    await fireEvent.click(sendButton);
    expect(fetchMock).not.toHaveBeenCalled();
    const message = screen.getByRole("textbox", { name: m.feedback_message_label() });
    expect(message).toHaveAttribute("aria-invalid", "true");
    expect(message).toHaveAttribute("aria-describedby", "feedback-message-error");
    expect(document.getElementById(message.getAttribute("aria-describedby") ?? "")).toBe(
      screen.getByRole("alert"),
    );
    expect(message).toHaveFocus();
    expect(screen.getByRole("alert")).toHaveTextContent(m.feedback_message_required());
  });

  it("exposes email purpose and validation relationship", async () => {
    renderWithFeedback(FeedbackPanel, { onClose: vi.fn(), open: true });

    await fireEvent.click(
      screen.getByRole("checkbox", {
        name: (name) => name.includes(m.feedback_wants_reply_label()),
      }),
    );
    const email = screen.getByRole("textbox", { name: m.feedback_email_aria() });
    expect(email).toHaveAttribute("autocomplete", "email");
    expect(email).toHaveAttribute("name", "email");

    const message = screen.getByRole("textbox", { name: m.feedback_message_label() });
    await fireEvent.input(message, { target: { value: "test message" } });

    await fireEvent.click(screen.getByRole("button", { name: m.feedback_send_action() }));
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAttribute("aria-describedby", "feedback-email-error");
    expect(email).toHaveFocus();
  });

  it("preserves a dismissed draft", async () => {
    const view = renderWithFeedback(FeedbackPanel, {
      onClose: vi.fn(),
      open: true,
    });
    const message = screen.getByRole("textbox", { name: m.feedback_message_label() });
    await fireEvent.input(message, { target: { value: "Draft feedback" } });

    await view.rerender({ onClose: vi.fn(), open: false });
    await view.rerender({ onClose: vi.fn(), open: true });
    expect(screen.getByRole("textbox", { name: m.feedback_message_label() })).toHaveValue(
      "Draft feedback",
    );
  });

  it("closes on Escape even when focus is outside the dialog", async () => {
    const onClose = vi.fn();
    renderWithFeedback(FeedbackPanel, { onClose, open: true });

    document.body.focus();
    await fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("contains keyboard focus within the open dialog", async () => {
    renderWithFeedback(FeedbackPanel, { onClose: vi.fn(), open: true });
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: m.toolbar_send_feedback() })).toHaveFocus();
    });
    const closeButton = screen.getByRole("button", { name: "Close Send feedback" });
    closeButton.focus();

    await fireEvent.keyDown(document, { key: "Tab", shiftKey: true });

    const sendButton = screen.getByRole("button", { name: m.feedback_send_action() });
    expect(document.activeElement).toBe(sendButton);
  });

  it("restores focus to the opener when the dialog closes", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();

    try {
      const view = renderWithFeedback(FeedbackPanel, {
        onClose: vi.fn(),
        open: true,
      });
      await waitFor(() => {
        expect(screen.getByRole("dialog", { name: m.toolbar_send_feedback() })).toHaveFocus();
      });

      await view.rerender({ onClose: vi.fn(), open: false });

      await waitFor(() => {
        expect(opener).toHaveFocus();
      });
    } finally {
      opener.remove();
    }
  });

  it("cancels the validation shake timer on unmount", async () => {
    vi.useFakeTimers();
    try {
      const view = renderWithFeedback(FeedbackPanel, { onClose: vi.fn(), open: true });
      await vi.advanceTimersByTimeAsync(0);
      await fireEvent.click(screen.getByRole("button", { name: m.feedback_send_action() }));
      await vi.advanceTimersByTimeAsync(0);
      expect(vi.getTimerCount()).toBe(1);
      view.unmount();
      await vi.advanceTimersByTimeAsync(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("disables submission while the request is in flight", async () => {
    let resolveRequest: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveRequest = resolve;
          }),
      ),
    );
    renderWithFeedback(FeedbackPanel, { onClose: vi.fn(), open: true });

    await fireEvent.input(screen.getByRole("textbox", { name: m.feedback_message_label() }), {
      target: { value: "Something is wrong" },
    });
    await fireEvent.click(screen.getByRole("button", { name: m.feedback_send_action() }));

    expect(screen.getByRole("button", { name: m.feedback_sending_action() })).toBeDisabled();
    resolveRequest?.(Response.json({ issueUrl: "https://example.com/issues/1" }));
    await waitFor(() => {
      expect(toast).toHaveBeenCalledTimes(1);
    });
  });

  it("clears the form and closes after a successful submission", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ issueUrl: "https://example.com/issues/1" })),
    );
    const onClose = vi.fn();
    renderWithFeedback(FeedbackPanel, { onClose, open: true });

    await fireEvent.input(screen.getByRole("textbox", { name: m.feedback_message_label() }), {
      target: { value: "Something is wrong" },
    });
    await fireEvent.click(screen.getByRole("button", { name: m.feedback_send_action() }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole("textbox", { name: m.feedback_message_label() })).toHaveValue("");
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it("says a preview build filed nothing, without an issue link", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ dryRun: true })));
    const onClose = vi.fn();
    renderWithFeedback(FeedbackPanel, { onClose, open: true });

    await fireEvent.input(screen.getByRole("textbox", { name: m.feedback_message_label() }), {
      target: { value: "Something is wrong" },
    });
    await fireEvent.click(screen.getByRole("button", { name: m.feedback_send_action() }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole("textbox", { name: m.feedback_message_label() })).toHaveValue("");
    expect(toast).toHaveBeenCalledTimes(1);
    const [notice, options] = toast.mock.calls[0] as [string, undefined | { action?: unknown }];
    expect(notice).toContain("Preview build");
    expect(notice).toContain("nothing was filed");
    expect(options?.action).toBeUndefined();
  });

  it("treats partial submission as final without exposing or duplicating contact details", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({ emailSaved: false, issueUrl: "https://example.com/issues/1" }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const onClose = vi.fn();
    renderWithFeedback(FeedbackPanel, { onClose, open: true });

    await fireEvent.click(
      screen.getByRole("checkbox", {
        name: (name) => name.includes(m.feedback_wants_reply_label()),
      }),
    );
    await fireEvent.input(screen.getByRole("textbox", { name: m.feedback_message_label() }), {
      target: { value: "Something is wrong" },
    });
    await fireEvent.input(screen.getByRole("textbox", { name: m.feedback_email_aria() }), {
      target: { value: "private@example.com" },
    });
    await fireEvent.click(screen.getByRole("button", { name: m.feedback_send_action() }));

    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledTimes(1);
    });
    const [warning] = toast.warning.mock.calls[0] as [string];
    expect(warning).toContain(m.feedback_toast_email_not_saved());
    expect(warning).not.toContain("comment");
    expect(warning).not.toContain("private@example.com");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the fallback copy action after a failed submission", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    renderWithFeedback(FeedbackPanel, { onClose: vi.fn(), open: true });

    await fireEvent.input(screen.getByRole("textbox", { name: m.feedback_message_label() }), {
      target: { value: "Something is wrong" },
    });
    await fireEvent.click(screen.getByRole("button", { name: m.feedback_send_action() }));

    expect(await screen.findByRole("alert")).toHaveTextContent(m.feedback_error_offline());
    expect(screen.getByRole("button", { name: m.feedback_copy_action() })).toBeInTheDocument();
  });

  it("downloads Turnstile again after a failed attempt, without a reload", async () => {
    vi.stubGlobal("turnstile", undefined);
    const held = holdTurnstileScripts();
    const view = renderWithFeedback(FeedbackPanel, { onClose: vi.fn(), open: true });
    await waitFor(() => {
      expect(held.scripts()).toHaveLength(1);
    });
    held.fail();
    expect(await screen.findByRole("link", { name: /GitHub/ })).toBeInTheDocument();

    await view.rerender({ onClose: vi.fn(), open: false });
    await view.rerender({ onClose: vi.fn(), open: true });
    await waitFor(() => {
      expect(held.scripts()).toHaveLength(1);
    });
    const render = vi.fn(() => "1");
    held.load({ remove: vi.fn(), render, reset: vi.fn() });
    await waitFor(() => {
      expect(render).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByRole("link", { name: /GitHub/ })).toBeNull();
  });

  it("offers the GitHub fallback as a link when Turnstile fails", async () => {
    (globalThis as unknown as Record<string, unknown>).turnstile = {
      remove: vi.fn(),
      render: (_container: HTMLElement, options: { "error-callback": () => void }) => {
        options["error-callback"]();
        return "1";
      },
      reset: vi.fn(),
    };
    renderWithFeedback(FeedbackPanel, { onClose: vi.fn(), open: true });

    const link = await screen.findByRole("link", { name: /GitHub/ });
    expect(link).toHaveAttribute("href", "https://github.com/mrh-is/mistria-fyi/issues/new");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });
});
