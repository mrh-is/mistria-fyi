import { fireEvent, screen, waitFor } from "@testing-library/svelte";
import { tick } from "svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

import FeedbackPanel from "#lib/components/feedback-panel.svelte";
import { FeedbackContext } from "#lib/feedback/context.svelte.js";
import * as m from "#lib/paraglide/messages.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { syncDiagnostics } from "#lib/sync/diagnostics.svelte.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";
import { holdTurnstileScripts } from "#lib/test-utils/turnstile-script.js";

import type { SyncLog } from "#lib/feedback/sync-log-schema.js";

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
    await fireEvent.click(screen.getByRole("button", { name: m.feedback_show_sync_log() }));
    const preview = document.querySelector("pre")?.textContent ?? "";
    const previewLog = JSON.parse(preview) as SyncLog;
    expect(previewLog.protocolVersion).toBe(1);
    expect(previewLog.events.map((event) => event.outcome)).toContain("unreadable");
    await fireEvent.click(checkbox);
    expect(screen.queryByRole("button", { name: m.feedback_hide_sync_log() })).toBeNull();
    await fireEvent.click(checkbox);
    await fireEvent.input(screen.getByRole("textbox", { name: m.feedback_message_label() }), {
      target: { value: "Sync trouble" },
    });
    await fireEvent.click(screen.getByRole("button", { name: m.feedback_send_action() }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(options.body as string)).toHaveProperty("syncLog", JSON.parse(preview));
    expect(checkbox).not.toBeChecked();
  });

  it("shows & sends sync events that arrive after opting in", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ dryRun: true }));
    vi.stubGlobal("fetch", fetchMock);
    renderWithFeedback(FeedbackPanel, { onClose: vi.fn(), open: true });
    await fireEvent.click(screen.getByRole("checkbox", { name: m.feedback_attach_sync_log() }));
    await fireEvent.click(screen.getByRole("button", { name: m.feedback_show_sync_log() }));
    const before = (JSON.parse(document.querySelector("pre")?.textContent ?? "") as SyncLog).events;
    syncDiagnostics.status("write-failed");
    await tick();
    const preview = document.querySelector("pre")?.textContent ?? "";
    const previewEvents = (JSON.parse(preview) as SyncLog).events;
    expect(previewEvents).toHaveLength(before.length + 1);
    expect(previewEvents.at(-1)?.outcome).toBe("write-failed");
    await fireEvent.input(screen.getByRole("textbox", { name: m.feedback_message_label() }), {
      target: { value: "Sync trouble" },
    });
    await fireEvent.click(screen.getByRole("button", { name: m.feedback_send_action() }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(options.body as string)).toHaveProperty("syncLog", JSON.parse(preview));
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
      await fireEvent.click(
        screen.getByRole("checkbox", { name: m.feedback_attach_progress_label() }),
      );
      await fireEvent.click(screen.getByRole("button", { name: m.feedback_toggle_read_more() }));
      await fireEvent.click(screen.getByRole("button", { name: m.feedback_show_progress_data() }));
      const preview = document.querySelector("pre")?.textContent ?? "";
      expect(JSON.parse(preview)).toEqual({
        lastSavePlaytime: "[redacted]",
        provenance: { renown: { playtime: "[redacted]", source: "save" } },
        renown: 7,
      });
      expect(preview).not.toContain("4321");
      await fireEvent.input(screen.getByRole("textbox", { name: m.feedback_message_label() }), {
        target: { value: "A report" },
      });
      await fireEvent.click(screen.getByRole("button", { name: m.feedback_send_action() }));
      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });
      const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
      const body = options.body as string;
      expect(body).not.toContain("4321");
      expect(JSON.parse(body)).toHaveProperty("saveData", JSON.parse(preview));
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
    await fireEvent.click(screen.getByRole("button", { name: m.feedback_toggle_read_more() }));
    await fireEvent.click(screen.getByRole("button", { name: m.feedback_show_progress_data() }));
    const preview = JSON.parse(document.querySelector("pre")?.textContent ?? "") as unknown;
    expect(preview).toHaveProperty("almanac", { count: 5000, summarized: true });
    await fireEvent.input(screen.getByRole("textbox", { name: m.feedback_message_label() }), {
      target: { value: "A report" },
    });
    await fireEvent.click(screen.getByRole("button", { name: m.feedback_send_action() }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toHaveProperty(
      "saveData",
      preview,
    );
  });

  it("omits sync diagnostics unless chosen", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ dryRun: true }));
    vi.stubGlobal("fetch", fetchMock);
    renderWithFeedback(FeedbackPanel, { onClose: vi.fn(), open: true });
    expect(screen.getByRole("checkbox", { name: m.feedback_attach_sync_log() })).toBeVisible();
    await fireEvent.input(screen.getByRole("textbox", { name: m.feedback_message_label() }), {
      target: { value: "A report" },
    });
    await fireEvent.click(screen.getByRole("button", { name: m.feedback_send_action() }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(options.body as string)).not.toHaveProperty("syncLog");
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
    await fireEvent.click(screen.getByRole("button", { name: m.feedback_toggle_read_more() }));
    await fireEvent.click(screen.getByRole("button", { name: m.feedback_show_progress_data() }));
    const preview = document.querySelector("pre")?.textContent ?? "";
    expect(preview).toContain('"renown": 7');
    expect(preview).not.toContain("Private");
    await fireEvent.input(screen.getByRole("textbox", { name: m.feedback_message_label() }), {
      target: { value: "Import feedback" },
    });
    await fireEvent.click(screen.getByRole("button", { name: m.feedback_send_action() }));
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

  it("clears progress preview and email validation when their options are unchecked", async () => {
    renderWithFeedback(FeedbackPanel, { onClose: vi.fn(), open: true });
    const attach = screen.getByRole("checkbox", { name: m.feedback_attach_progress_label() });
    await fireEvent.click(attach);
    await fireEvent.click(screen.getByRole("button", { name: m.feedback_toggle_read_more() }));
    await fireEvent.click(screen.getByRole("button", { name: m.feedback_show_progress_data() }));
    expect(
      screen.getByRole("button", { name: m.feedback_hide_progress_data() }),
    ).toBeInTheDocument();
    await fireEvent.click(attach);
    expect(
      screen.getByRole("button", { name: m.feedback_show_progress_data() }),
    ).toBeInTheDocument();

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

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn’t send your feedback. Check that you’re online, then please try again.",
    );
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
