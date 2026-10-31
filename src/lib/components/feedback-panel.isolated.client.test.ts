import { fireEvent, screen, waitFor } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

import FeedbackPanel from "#lib/components/feedback-panel.svelte";
import { FeedbackContext } from "#lib/feedback/context.svelte.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { syncDiagnostics } from "#lib/sync/diagnostics.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";

import type { SyncLog } from "#lib/feedback/sync-log-schema.js";

const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn(), warning: vi.fn() }));
const syncSwitch = vi.hoisted(() => ({ syncSwitchOn: true }));
vi.mock("#lib/sync/sync-switch.js", () => syncSwitch);

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
    syncSwitch.syncSwitchOn = true;
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
    const checkbox = screen.getByRole("checkbox", { name: "Attach my save file sync log" });
    expect(checkbox).not.toBeChecked();
    await fireEvent.click(checkbox);
    await fireEvent.click(screen.getByRole("button", { name: "Show sync log" }));
    const preview = document.querySelector("pre")?.textContent ?? "";
    const previewLog = JSON.parse(preview) as SyncLog;
    expect(previewLog.protocolVersion).toBe(1);
    expect(previewLog.events.map((event) => event.outcome)).toContain("unreadable");
    await fireEvent.click(checkbox);
    expect(screen.queryByRole("button", { name: "Hide sync log" })).toBeNull();
    await fireEvent.click(checkbox);
    await fireEvent.input(screen.getByRole("textbox", { name: "Message" }), {
      target: { value: "Sync trouble" },
    });
    await fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(options.body as string)).toHaveProperty("syncLog", JSON.parse(preview));
    expect(checkbox).not.toBeChecked();
  });

  it.each([true, false])("omits sync diagnostics unless chosen (switch %s)", async (on) => {
    syncSwitch.syncSwitchOn = on;
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ dryRun: true }));
    vi.stubGlobal("fetch", fetchMock);
    renderWithFeedback(FeedbackPanel, { onClose: vi.fn(), open: true });
    expect(screen.queryByRole("checkbox", { name: "Attach my save file sync log" }) !== null).toBe(
      on,
    );
    await fireEvent.input(screen.getByRole("textbox", { name: "Message" }), {
      target: { value: "A report" },
    });
    await fireEvent.click(screen.getByRole("button", { name: "Send" }));
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
    userState.mergeFromSave(
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
    await fireEvent.click(screen.getByRole("checkbox", { name: "Attach my tracker progress" }));
    await fireEvent.click(screen.getByRole("button", { name: "Read more" }));
    await fireEvent.click(screen.getByRole("button", { name: "Show my progress data" }));
    const preview = document.querySelector("pre")?.textContent ?? "";
    expect(preview).toContain('"renown": 7');
    expect(preview).not.toContain("Private");
    await fireEvent.input(screen.getByRole("textbox", { name: "Message" }), {
      target: { value: "Import feedback" },
    });
    await fireEvent.click(screen.getByRole("button", { name: "Send" }));
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

    const dialog = screen.getByRole("dialog", { name: "Send feedback" });
    expect(dialog).toHaveAttribute(
      "style",
      "--primary: var(--color-category-museum); --ring: var(--color-category-museum);",
    );
    expect(screen.getByRole("checkbox", { name: /I’d like a reply/ })).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Comments, questions, suggestions, praise?"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });

  it("renders nothing when closed", () => {
    renderWithFeedback(FeedbackPanel, { onClose: vi.fn(), open: false });

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps the elastic-overscroll backdrop below the persistent page chrome", () => {
    renderWithFeedback(FeedbackPanel, { onClose: vi.fn(), open: true });

    const backdrop = document.querySelector('[aria-label="Close feedback"]');
    expect(backdrop).toHaveClass("top-[-100dvh]", "bottom-[-100dvh]", "z-0");
    expect(screen.getByRole("dialog", { name: "Send feedback" })).toHaveClass("z-[var(--z-panel)]");
  });

  it("clears progress preview and email validation when their options are unchecked", async () => {
    renderWithFeedback(FeedbackPanel, { onClose: vi.fn(), open: true });
    const attach = screen.getByRole("checkbox", { name: "Attach my tracker progress" });
    await fireEvent.click(attach);
    await fireEvent.click(screen.getByRole("button", { name: "Read more" }));
    await fireEvent.click(screen.getByRole("button", { name: "Show my progress data" }));
    expect(screen.getByRole("button", { name: "Hide my progress data" })).toBeInTheDocument();
    await fireEvent.click(attach);
    expect(screen.getByRole("button", { name: "Show my progress data" })).toBeInTheDocument();

    const reply = screen.getByRole("checkbox", { name: "I’d like a reply" });
    await fireEvent.click(reply);
    await fireEvent.blur(screen.getByRole("textbox", { name: "Your email" }));
    expect(screen.getByRole("textbox", { name: "Your email" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await fireEvent.click(reply);
    await fireEvent.click(reply);
    expect(screen.getByRole("textbox", { name: "Your email" })).toHaveAttribute(
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

    await fireEvent.click(screen.getByRole("button", { name: "Point at something" }));
    expect(feedbackContext.isPicking).toBe(true);
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Send feedback" })).toBeNull();
    });

    feedbackContext.select({
      category: "recipe",
      displayName: "Tomato Soup",
      entityId: "tomato_soup",
      page: "/recipes",
    });
    expect(await screen.findByText("Tomato Soup")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Change" })).toHaveFocus();
    });

    await fireEvent.click(screen.getByRole("button", { name: "Clear selected item" }));
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

    await fireEvent.click(screen.getByRole("button", { name: "Point at something" }));
    feedbackContext.select({
      category: "recipe",
      displayName: "Tomato Soup",
      entityId: "tomato_soup",
      page: "/recipes",
    });
    await fireEvent.input(await screen.findByRole("textbox", { name: "Message" }), {
      target: { value: "The ingredients are wrong" },
    });
    await fireEvent.click(screen.getByRole("button", { name: "Send" }));

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

    const sendButton = screen.getByRole("button", { name: "Send" });
    expect(sendButton).not.toHaveAttribute("aria-disabled");
    await fireEvent.click(sendButton);
    expect(fetchMock).not.toHaveBeenCalled();
    const message = screen.getByRole("textbox", { name: "Message" });
    expect(message).toHaveAttribute("aria-invalid", "true");
    expect(message).toHaveAttribute("aria-describedby", "feedback-message-error");
    expect(document.getElementById(message.getAttribute("aria-describedby") ?? "")).toBe(
      screen.getByRole("alert"),
    );
    expect(message).toHaveFocus();
    expect(screen.getByRole("alert")).toHaveTextContent("Please enter a message.");
  });

  it("exposes email purpose and validation relationship", async () => {
    renderWithFeedback(FeedbackPanel, { onClose: vi.fn(), open: true });

    await fireEvent.click(screen.getByRole("checkbox", { name: /I’d like a reply/ }));
    const email = screen.getByRole("textbox", { name: "Your email" });
    expect(email).toHaveAttribute("autocomplete", "email");
    expect(email).toHaveAttribute("name", "email");

    const message = screen.getByRole("textbox", { name: "Message" });
    await fireEvent.input(message, { target: { value: "test message" } });

    await fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAttribute("aria-describedby", "feedback-email-error");
    expect(email).toHaveFocus();
  });

  it("preserves a dismissed draft", async () => {
    const view = renderWithFeedback(FeedbackPanel, {
      onClose: vi.fn(),
      open: true,
    });
    const message = screen.getByRole("textbox", { name: "Message" });
    await fireEvent.input(message, { target: { value: "Draft feedback" } });

    await view.rerender({ onClose: vi.fn(), open: false });
    await view.rerender({ onClose: vi.fn(), open: true });
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("Draft feedback");
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
      expect(screen.getByRole("dialog", { name: "Send feedback" })).toHaveFocus();
    });
    const closeButton = screen.getByRole("button", { name: "Close Send feedback" });
    closeButton.focus();

    await fireEvent.keyDown(document, { key: "Tab", shiftKey: true });

    const sendButton = screen.getByRole("button", { name: "Send" });
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
        expect(screen.getByRole("dialog", { name: "Send feedback" })).toHaveFocus();
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
      await fireEvent.click(screen.getByRole("button", { name: "Send" }));
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

    await fireEvent.input(screen.getByRole("textbox", { name: "Message" }), {
      target: { value: "Something is wrong" },
    });
    await fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
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

    await fireEvent.input(screen.getByRole("textbox", { name: "Message" }), {
      target: { value: "Something is wrong" },
    });
    await fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("");
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it("says a preview build filed nothing, without an issue link", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ dryRun: true })));
    const onClose = vi.fn();
    renderWithFeedback(FeedbackPanel, { onClose, open: true });

    await fireEvent.input(screen.getByRole("textbox", { name: "Message" }), {
      target: { value: "Something is wrong" },
    });
    await fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("");
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

    await fireEvent.click(screen.getByRole("checkbox", { name: /I’d like a reply/ }));
    await fireEvent.input(screen.getByRole("textbox", { name: "Message" }), {
      target: { value: "Something is wrong" },
    });
    await fireEvent.input(screen.getByRole("textbox", { name: "Your email" }), {
      target: { value: "private@example.com" },
    });
    await fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledTimes(1);
    });
    const [warning] = toast.warning.mock.calls[0] as [string];
    expect(warning).toContain("Sending it again would create a duplicate public issue");
    expect(warning).toContain("submit a new report later");
    expect(warning).not.toContain("comment");
    expect(warning).not.toContain("private@example.com");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the fallback copy action after a failed submission", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    renderWithFeedback(FeedbackPanel, { onClose: vi.fn(), open: true });

    await fireEvent.input(screen.getByRole("textbox", { name: "Message" }), {
      target: { value: "Something is wrong" },
    });
    await fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not connect. Please try again or copy your message.",
    );
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
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
