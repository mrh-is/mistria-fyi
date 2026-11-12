import { fireEvent, screen, waitFor, within } from "@testing-library/svelte";
import { tick } from "svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

import FeedbackPanel from "#lib/components/feedback-panel.svelte";
import { FeedbackContext } from "#lib/feedback/context.svelte.js";
import { outlineText } from "#lib/feedback/outline.js";
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

const progressTitle = () => "Your progress";
const syncLogTitle = () => "Your sync log";

/** Opens a preview sheet from its row's Peek slip. */
async function openSheet(slip: string, title: string): Promise<HTMLElement> {
  const form = screen.getByRole("dialog", { name: "Send feedback" });
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
  await fireEvent.click(within(sheet).getByRole("button", { name: "Close" }));
  await waitFor(() => {
    expect(sheet).not.toBeInTheDocument();
  });
}

async function send(message: string): Promise<void> {
  await fireEvent.input(screen.getByRole("textbox", { name: "Message" }), {
    target: { value: message },
  });
  await fireEvent.click(screen.getByRole("button", { name: "Send" }));
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
    const checkbox = screen.getByRole("checkbox", { name: "Attach sync log" });
    expect(checkbox).not.toBeChecked();
    await fireEvent.click(checkbox);
    const sheet = await openSheet("Peek at my sync log", syncLogTitle());
    const preview = sheetText(sheet);
    expect(preview).toContain("protocolVersion: 1");
    expect(preview).toContain("outcome: unreadable");
    // The sheet's toggle mirrors the row's, and turning it off leaves the sheet open.
    const sheetToggle = within(sheet).getByRole("checkbox", { name: "Attach sync log" });
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
    await fireEvent.click(screen.getByRole("checkbox", { name: "Attach sync log" }));
    const sheet = await openSheet("Peek at my sync log", syncLogTitle());
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
      const sheet = await openSheet("Peek at my progress", progressTitle());
      const preview = sheetText(sheet);
      expect(preview).toContain("lastSavePlaytime: [redacted]");
      expect(preview).toContain("    playtime: [redacted]");
      expect(preview).not.toContain("4321");
      await fireEvent.click(within(sheet).getByRole("checkbox", { name: "Attach progress" }));
      await closeSheet(sheet);
      expect(screen.getByRole("checkbox", { name: "Attach progress" })).toBeChecked();
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
    await fireEvent.click(screen.getByRole("checkbox", { name: "Attach progress" }));
    const sheet = await openSheet("Peek at my progress", progressTitle());
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
    expect(screen.getByRole("checkbox", { name: "Attach sync log" })).toBeVisible();
    await send("A report");
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(requestBody(fetchMock)).not.toHaveProperty("syncLog");
  });

  it("hides the sync log row & its card entry when the log isn't offered", async () => {
    renderWithFeedback(FeedbackPanel, { allowSyncLog: false, onClose: vi.fn(), open: true });
    expect(screen.queryByRole("checkbox", { name: "Attach sync log" })).toBeNull();
    await fireEvent.click(screen.getByRole("button", { name: "What the extras send" }));
    const card = await screen.findByRole("dialog", { name: "What the extras send" });
    expect(within(card).queryByText("Sync log")).toBeNull();
    expect(within(card).getByText("Progress")).toBeVisible();
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
    await fireEvent.click(screen.getByRole("checkbox", { name: "Attach progress" }));
    const sheet = await openSheet("Peek at my progress", progressTitle());
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

    const dialog = screen.getByRole("dialog", { name: "Send feedback" });
    expect(dialog).toHaveAttribute(
      "style",
      "--primary: var(--color-category-museum); --ring: var(--color-category-museum);",
    );
    expect(
      screen.getByRole("checkbox", {
        name: (name) => name.includes("Email me back"),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("What’s up? Bugs, ideas, questions, kind words…"),
    ).toBeInTheDocument();
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
    const progress = screen.getByRole("checkbox", { name: "Attach progress" });
    const syncLog = screen.getByRole("checkbox", { name: "Attach sync log" });
    const reply = screen.getByRole("checkbox", { name: "Email me back" });

    // From a row: the preview is readable while the extra stays off.
    let sheet = await openSheet("Peek at my progress", progressTitle());
    expect(sheetText(sheet)).toBe("renown: 7");
    expect(within(sheet).getByText("Public")).toBeVisible();
    // From the sheet: switching it on & back off there leaves it off.
    const sheetToggle = within(sheet).getByRole("checkbox", {
      name: "Attach progress",
    });
    await fireEvent.click(sheetToggle);
    expect(progress).toBeChecked();
    await fireEvent.click(sheetToggle);
    expect(progress).not.toBeChecked();
    await closeSheet(sheet);

    // From the card: opening it, & peeking from it, turns nothing on.
    await fireEvent.click(screen.getByRole("button", { name: "What the extras send" }));
    const card = await screen.findByRole("dialog", { name: "What the extras send" });
    await fireEvent.click(within(card).getByRole("button", { name: "Peek at my sync log" }));
    sheet = await screen.findByRole("dialog", { name: syncLogTitle() });
    expect(sheetText(sheet)).toContain("outcome: unreadable");
    await closeSheet(sheet);
    expect(card).toBeInTheDocument();
    await fireEvent.click(within(card).getByRole("button", { name: "Got it" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "What the extras send" })).toBeNull();
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
    expect(screen.getByRole("checkbox", { name: "Attach progress" })).toHaveAccessibleDescription(
      `Public What you’ve checked off & your skill levels, so we can see what you’re seeing.`,
    );
    expect(screen.getByRole("checkbox", { name: "Attach sync log" })).toHaveAccessibleDescription(
      `Public Your recent save file syncs from this tab, for when syncing acts up. Names & sync links come out first.`,
    );
  });

  it("says a reply needs a private email, seen only by Michael, before opting in", async () => {
    renderWithFeedback(FeedbackPanel, { onClose: vi.fn(), open: true });
    const reply = screen.getByRole("checkbox", { name: "Email me back" });
    expect(reply).not.toBeChecked();
    expect(screen.queryByRole("textbox", { name: "Your email" })).toBeNull();
    expect(reply).toHaveAccessibleDescription(
      `Private We’ll ask for your email so Michael can write back. Nobody else sees it, and it never goes on the issue.`,
    );
    expect(
      "We’ll ask for your email so Michael can write back. Nobody else sees it, and it never goes on the issue.",
    ).toContain("Michael");
    await fireEvent.click(reply);
    const email = screen.getByRole("textbox", { name: "Your email" });
    expect(email).toHaveAccessibleDescription(
      "Only Michael sees this. It never goes on the issue.",
    );
    expect("Only Michael sees this. It never goes on the issue.").toContain("Michael");
    expect(reply.closest(".extra-row")).toContainElement(email);
  });

  it("closes only the top layer on Escape, and returns focus to its opener", async () => {
    const onClose = vi.fn();
    renderWithFeedback(FeedbackPanel, { onClose, open: true });
    const info = screen.getByRole("button", { name: "What the extras send" });
    info.focus();
    await fireEvent.click(info);
    const card = await screen.findByRole("dialog", { name: "What the extras send" });
    const slip = within(card).getByRole("button", { name: "Peek at my progress" });
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
      expect(screen.queryByRole("dialog", { name: "What the extras send" })).toBeNull();
    });
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(info).toHaveFocus();
    });
  });

  it("clears email validation when the reply is switched off", async () => {
    renderWithFeedback(FeedbackPanel, { onClose: vi.fn(), open: true });
    const reply = screen.getByRole("checkbox", { name: "Email me back" });
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
    expect(screen.getByRole("alert")).toHaveTextContent("What did you wanna say?");
  });

  it("exposes email purpose and validation relationship", async () => {
    renderWithFeedback(FeedbackPanel, { onClose: vi.fn(), open: true });

    await fireEvent.click(
      screen.getByRole("checkbox", {
        name: (name) => name.includes("Email me back"),
      }),
    );
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

    await fireEvent.click(
      screen.getByRole("checkbox", {
        name: (name) => name.includes("Email me back"),
      }),
    );
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
    expect(warning).toContain(
      "Your feedback went through, but we couldn’t save your email, so I won’t be able to reply. If you still want a private reply, submit feedback again, and I’ll get it sorted out.",
    );
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
      "We couldn’t send your feedback. Check that you’re online, then please try again.",
    );
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
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
    // One message places the link, so the sentence keeps each locale's word order & punctuation.
    expect(link.closest("p")?.textContent.replaceAll(/\s+/gu, " ").trim()).toBe(
      "Our bot check isn’t loading right now. You can still submit feedback on GitHub directly.",
    );
  });
});
