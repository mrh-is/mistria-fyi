import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

import FeedbackPanel from "$lib/components/feedback-panel.svelte";
import { FeedbackContext } from "$lib/feedback/context.svelte.js";

const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }));

vi.mock("svelte-sonner", () => ({ toast }));

function mockTurnstile() {
  let widgetId = 0;
  (window as unknown as Record<string, unknown>).turnstile = {
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
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    mockTurnstile();
  });

  it("renders form fields when open", () => {
    render(FeedbackPanel, { onclose: vi.fn(), open: true, resetKey: "/museum" });

    expect(screen.getByRole("dialog", { name: "Send feedback" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /reach out if I need more deets/ })).toBeTruthy();
    expect(screen.getByText(/Send me a note/)).toBeTruthy();
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

    await fireEvent.click(screen.getByRole("button", { name: "Pick an item" }));
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

    await fireEvent.click(screen.getByRole("button", { name: "Pick an item" }));
    feedbackContext.select({
      category: "recipe",
      displayName: "Tomato Soup",
      entityId: "tomato_soup",
      page: "/recipes",
    });
    await fireEvent.input(await screen.findByRole("textbox", { name: "Message" }), {
      target: { value: "The ingredients are wrong" },
    });
    await fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
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

    const sendButton = screen.getByRole("button", { name: "Send feedback" });
    expect(sendButton).not.toHaveAttribute("aria-disabled");
    await fireEvent.click(sendButton);
    expect(fetchMock).not.toHaveBeenCalled();
    const message = screen.getByRole("textbox", { name: "Message" });
    expect(message).toHaveAttribute("aria-invalid", "true");
    expect(message).toHaveAttribute("aria-describedby", "feedback-message-error");
    expect(message).toHaveFocus();
    expect(screen.getByRole("alert", { name: "Please enter a message." })).toBeTruthy();
  });

  it("exposes email purpose and validation relationship", async () => {
    render(FeedbackPanel, { onclose: vi.fn(), open: true, resetKey: "/museum" });

    await fireEvent.click(screen.getByRole("checkbox", { name: /reach out if I need more deets/ }));
    const email = screen.getByRole("textbox", { name: "Your email" });
    expect(email).toHaveAttribute("autocomplete", "email");
    expect(email).toHaveAttribute("name", "email");

    await fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));
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
    await fireEvent.keyDown(window, { key: "Escape" });

    expect(onclose).toHaveBeenCalledOnce();
  });

  it("contains keyboard focus within the open dialog", async () => {
    render(FeedbackPanel, { onclose: vi.fn(), open: true, resetKey: "/museum" });
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Message" })).toHaveFocus();
    });
    const closeButton = screen.getByRole("button", { name: "Close" });
    closeButton.focus();

    await fireEvent.keyDown(window, { key: "Tab", shiftKey: true });

    const sendButton = screen.getByRole("button", { name: "Send feedback" });
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
        expect(screen.getByRole("textbox", { name: "Message" })).toHaveFocus();
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
    let resolveRequest: (response: Response) => void = () => undefined;
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
    await fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));

    expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
    resolveRequest(Response.json({ issueUrl: "https://example.com/issues/1" }));
    await waitFor(() => {
      expect(toast).toHaveBeenCalledOnce();
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
    await fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));

    await waitFor(() => {
      expect(onclose).toHaveBeenCalledOnce();
    });
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("");
    expect(toast).toHaveBeenCalledOnce();
  });

  it("shows the fallback copy action after a failed submission", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(FeedbackPanel, { onclose: vi.fn(), open: true, resetKey: "/museum" });

    await fireEvent.input(screen.getByRole("textbox", { name: "Message" }), {
      target: { value: "Something is wrong" },
    });
    await fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not connect. Please try again or copy your message.",
    );
    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
  });
});
