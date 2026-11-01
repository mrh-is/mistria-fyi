import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { beforeEach, expect, it, vi } from "vitest";

import ToolbarFooterHarness from "#lib/components/toolbar-footer.test-harness.svelte";
import { trackerData } from "#lib/data/index.js";
import { FeedbackContext } from "#lib/feedback/context.svelte.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { pageStub } from "#lib/test-utils/page-stub.svelte.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";

import ErrorPage from "./+error.svelte";

const navigation = vi.hoisted(() => ({ afterNavigate: vi.fn() }));
vi.mock("$app/navigation", () => navigation);
vi.mock("$app/env", () => ({ dev: true, version: "test-app-version" }));

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  pageStub.reset();
  pageStub.status = 500;
  pageStub.navigate("/en/private-path?private-query=secret");
  navigation.afterNavigate.mockClear();
  vi.stubGlobal("turnstile", {
    remove: vi.fn(),
    render: (_container: HTMLElement, options: { callback: (token: string) => void }) => {
      options.callback("test-token");
      return "test-widget";
    },
    reset: vi.fn(),
  });
});

function renderError() {
  const feedbackContext = new FeedbackContext();
  render(ToolbarFooterHarness, { feedbackContext });
  renderWithFeedback(ErrorPage, {}, feedbackContext);
}

async function openReport() {
  const button = screen.getByRole("button", { name: "Report this error" });
  button.focus();
  await fireEvent.click(button);
  return screen.findByRole("textbox", { name: "Message" });
}

it("offers reports for errors, without offering one for missing pages", () => {
  pageStub.status = 404;
  renderError();
  expect(screen.queryByRole("button", { name: "Report this error" })).toBeNull();
});

it("opens an editable draft without submitting, and cancels without sending", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  renderError();
  const message = await openReport();
  expect(message).toHaveValue("Something went wrong.");
  expect(screen.getByText(/public GitHub issue/)).toBeInTheDocument();
  expect(screen.getByTestId("overlay-state")).toHaveTextContent("active");
  await fireEvent.input(message, { target: { value: "I was checking my museum progress." } });
  await fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => {
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  expect(fetchMock).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Report this error" })).toHaveFocus(),
  );
});

it("submits only reviewed text and existing versions by default", async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ dryRun: true }));
  vi.stubGlobal("fetch", fetchMock);
  renderError();
  const message = await openReport();
  expect(screen.getByRole("checkbox", { name: "Attach my tracker progress" })).not.toBeChecked();
  expect(screen.getByRole("checkbox", { name: "I’d like a reply" })).not.toBeChecked();
  expect(screen.queryByRole("checkbox", { name: "Attach my save file sync log" })).toBeNull();
  await fireEvent.input(message, { target: { value: "My reviewed report" } });
  await fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe("/api/feedback");
  expect(JSON.parse(options.body as string)).toEqual({
    appVersion: "test-app-version",
    gameDataVersion: trackerData.version,
    message: "My reviewed report",
    turnstileToken: "test-token",
  });
  await waitFor(() => {
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

it("returns to ordinary feedback after navigation, without reopening the report", async () => {
  renderError();
  await openReport();
  pageStub.navigate("/en/museum");
  const afterNavigate = navigation.afterNavigate.mock.calls[0][0] as (event: {
    shallow: boolean;
  }) => void;
  afterNavigate({ shallow: false });
  await waitFor(() => {
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  await fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));
  expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("");
});

it.each([true, false])(
  "keeps progress and contact opt-in, including reversal (%s)",
  async (include) => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ dryRun: true }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(userState, "exportBackup").mockReturnValue(
      JSON.stringify({ progress: { renown: 7 } }),
    );
    renderError();
    await openReport();
    const progress = screen.getByRole("checkbox", { name: "Attach my tracker progress" });
    const contact = screen.getByRole("checkbox", { name: "I’d like a reply" });
    await fireEvent.click(progress);
    await fireEvent.click(contact);
    await fireEvent.input(screen.getByRole("textbox", { name: "Your email" }), {
      target: { value: "reporter@example.com" },
    });
    if (!include) {
      await fireEvent.click(progress);
      await fireEvent.click(contact);
    }
    await fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const payload = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    ) as Record<string, unknown>;
    expect(payload.saveData).toEqual(include ? { renown: 7 } : undefined);
    expect(payload.email).toBe(include ? "reporter@example.com" : undefined);
  },
);

it.each(["server", "network"])("keeps the edited report after a %s failure", async (failure) => {
  const fetchMock =
    failure === "server"
      ? vi
          .fn()
          .mockResolvedValue(Response.json({ message: "Please try again later." }, { status: 503 }))
      : vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
  vi.stubGlobal("fetch", fetchMock);
  renderError();
  const message = await openReport();
  await fireEvent.input(message, { target: { value: "Keep this report" } });
  await fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await screen.findByRole("button", { name: "Copy" });
  expect(message).toHaveValue("Keep this report");
  expect(screen.getByRole("dialog", { name: "Send feedback" })).toBeInTheDocument();
});
