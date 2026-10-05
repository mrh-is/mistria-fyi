import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

import FeedbackPanel from "#lib/components/feedback-panel.svelte";
import { FeedbackContext } from "#lib/feedback/context.svelte.js";

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

  it("renders form fields when open", () => {
    render(FeedbackPanel, {
      accent: "var(--cat-museum)",
      onclose: vi.fn(),
      open: true,
      resetKey: "/museum",
    });

    const dialog = screen.getByRole("dialog", { name: "Send feedback" });
    expect(dialog).toHaveAttribute(
      "style",
      "--primary: var(--cat-museum); --ring: var(--cat-museum);",
    );
    expect(screen.getByRole("checkbox", { name: /I’d like a reply/ })).toBeTruthy();
    expect(screen.getByPlaceholderText("Comments, questions, suggestions, praise?")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });

  it("renders nothing when closed", () => {
    render(FeedbackPanel, { onclose: vi.fn(), open: false, resetKey: "/museum" });

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps the elastic-overscroll backdrop below the persistent page chrome", () => {
    render(FeedbackPanel, { onclose: vi.fn(), open: true, resetKey: "/museum" });

    const backdrop = document.querySelector('[aria-label="Close feedback"]');
    expect(backdrop).toHaveClass("top-[-100dvh]", "bottom-[-100dvh]", "z-0");
    expect(screen.getByRole("dialog", { name: "Send feedback" })).toHaveClass("z-30");
  });

  it("offers the picker only when enabled and reportable elements exist", async () => {
    const feedbackContext = new FeedbackContext();
    const reportableElement = document.createElement("div");
    document.body.append(reportableElement);
    feedbackContext.reportable({
      category: "recipe",
      displayName: "Tomato Soup",
      entityId: "tomato_soup",
      page: "/recipes",
    })(reportableElement);

    const view = render(FeedbackPanel, {
      feedbackContext,
      onclose: vi.fn(),
      open: true,
      pickerEnabled: true,
      resetKey: "/recipes",
    });

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
    expect(await screen.findByText("Tomato Soup")).toBeTruthy();
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
    feedbackContext.reportable({
      category: "recipe",
      displayName: "Tomato Soup",
      entityId: "tomato_soup",
      page: "/recipes",
    })(reportableElement);
    render(FeedbackPanel, {
      feedbackContext,
      onclose: vi.fn(),
      open: true,
      pickerEnabled: true,
      resetKey: "/recipes",
    });

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
    render(FeedbackPanel, { onclose: vi.fn(), open: true, resetKey: "/museum" });

    const sendButton = screen.getByRole("button", { name: "Send" });
    expect(sendButton).not.toHaveAttribute("aria-disabled");
    await fireEvent.click(sendButton);
    expect(fetchMock).not.toHaveBeenCalled();
    const message = screen.getByRole("textbox", { name: "Message" });
    expect(message).toHaveAttribute("aria-invalid", "true");
    expect(message).toHaveAttribute("aria-describedby", "feedback-message-error");
    expect(message).toHaveFocus();
    expect(screen.getByRole("alert")).toHaveTextContent("Please enter a message.");
  });

  it("exposes email purpose and validation relationship", async () => {
    render(FeedbackPanel, { onclose: vi.fn(), open: true, resetKey: "/museum" });

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

  it("preserves a dismissed draft and clears it after navigation", async () => {
    const view = render(FeedbackPanel, {
      onclose: vi.fn(),
      open: true,
      resetKey: "/museum",
    });
    const message = screen.getByRole("textbox", { name: "Message" });
    await fireEvent.input(message, { target: { value: "Draft feedback" } });

    await view.rerender({ onclose: vi.fn(), open: false, resetKey: "/museum" });
    await view.rerender({ onclose: vi.fn(), open: true, resetKey: "/museum" });
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("Draft feedback");

    await view.rerender({ onclose: vi.fn(), open: true, resetKey: "/mines" });
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("");
    });
  });

  it("closes on Escape even when focus is outside the dialog", async () => {
    const onclose = vi.fn();
    render(FeedbackPanel, { onclose, open: true, resetKey: "/museum" });

    document.body.focus();
    await fireEvent.keyDown(document, { key: "Escape" });

    expect(onclose).toHaveBeenCalledTimes(1);
  });

  it("contains keyboard focus within the open dialog", async () => {
    render(FeedbackPanel, { onclose: vi.fn(), open: true, resetKey: "/museum" });
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
      const view = render(FeedbackPanel, {
        onclose: vi.fn(),
        open: true,
        resetKey: "/museum",
      });
      await waitFor(() => {
        expect(screen.getByRole("dialog", { name: "Send feedback" })).toHaveFocus();
      });

      await view.rerender({ onclose: vi.fn(), open: false, resetKey: "/museum" });

      await waitFor(() => {
        expect(opener).toHaveFocus();
      });
    } finally {
      opener.remove();
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
    render(FeedbackPanel, { onclose: vi.fn(), open: true, resetKey: "/museum" });

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
    const onclose = vi.fn();
    render(FeedbackPanel, { onclose, open: true, resetKey: "/museum" });

    await fireEvent.input(screen.getByRole("textbox", { name: "Message" }), {
      target: { value: "Something is wrong" },
    });
    await fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(onclose).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("");
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it("treats partial submission as final without exposing or duplicating contact details", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({ emailSaved: false, issueUrl: "https://example.com/issues/1" }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const onclose = vi.fn();
    render(FeedbackPanel, { onclose, open: true, resetKey: "/museum" });

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
    expect(onclose).toHaveBeenCalledTimes(1);
  });

  it("shows the fallback copy action after a failed submission", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(FeedbackPanel, { onclose: vi.fn(), open: true, resetKey: "/museum" });

    await fireEvent.input(screen.getByRole("textbox", { name: "Message" }), {
      target: { value: "Something is wrong" },
    });
    await fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not connect. Please try again or copy your message.",
    );
    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
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
    render(FeedbackPanel, { onclose: vi.fn(), open: true, resetKey: "/museum" });

    const link = await screen.findByRole("link", { name: /GitHub/ });
    expect(link).toHaveAttribute("href", "https://github.com/mrh-is/mistria-fyi/issues/new");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });
});
