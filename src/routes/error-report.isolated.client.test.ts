import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { beforeEach, expect, it, vi } from "vitest";

import ToolbarFooterHarness from "#lib/components/toolbar-footer.test-harness.svelte";
import { trackerData } from "#lib/data/index.js";
import { FeedbackContext } from "#lib/feedback/context.svelte.js";
import * as m from "#lib/paraglide/messages.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { pageStub } from "#lib/test-utils/page-stub.svelte.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";

import ErrorPage from "./+error.svelte";

const navigation = vi.hoisted(() => ({ afterNavigate: vi.fn(), onNavigate: vi.fn() }));
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
  const button = screen.getByRole("button", { name: m.error_report_action() });
  button.focus();
  await fireEvent.click(button);
  return screen.findByRole("textbox", { name: m.feedback_message_label() });
}

it("offers reports for errors, without offering one for missing pages", () => {
  pageStub.status = 404;
  renderError();
  expect(screen.queryByRole("button", { name: m.error_report_action() })).toBeNull();
});

it("opens an editable draft without submitting, and cancels without sending", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  renderError();
  const message = await openReport();
  expect(message).toHaveValue(m.error_generic());
  expect(screen.getByText(/public GitHub issue/)).toBeInTheDocument();
  // The shell makes its page inert behind the open report.
  expect(screen.getByTestId("page-content").closest("[inert]")).not.toBeNull();
  await fireEvent.input(message, { target: { value: "I was checking my museum progress." } });
  await fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => {
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  expect(fetchMock).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: m.error_report_action() })).toHaveFocus(),
  );
});

it("submits only reviewed text and existing versions by default", async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ dryRun: true }));
  vi.stubGlobal("fetch", fetchMock);
  renderError();
  const message = await openReport();
  expect(
    screen.getByRole("checkbox", { name: m.feedback_attach_progress_label() }),
  ).not.toBeChecked();
  expect(screen.getByRole("checkbox", { name: m.feedback_wants_reply_label() })).not.toBeChecked();
  expect(screen.queryByRole("checkbox", { name: m.feedback_attach_sync_log() })).toBeNull();
  await fireEvent.input(message, { target: { value: "My reviewed report" } });
  await fireEvent.click(screen.getByRole("button", { name: m.feedback_send_action() }));
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
  // The layout's toolbar & thumb tabs both listen, so the navigation reaches every listener.
  for (const [onNavigated] of navigation.afterNavigate.mock.calls) {
    (onNavigated as (event: { type: string; shallow: boolean }) => void)({
      type: "link",
      shallow: false,
    });
  }
  await waitFor(() => {
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  await fireEvent.click(screen.getByRole("button", { name: m.toolbar_send_feedback() }));
  expect(screen.getByRole("textbox", { name: m.feedback_message_label() })).toHaveValue("");
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
    const progress = screen.getByRole("checkbox", { name: m.feedback_attach_progress_label() });
    const contact = screen.getByRole("checkbox", { name: m.feedback_wants_reply_label() });
    await fireEvent.click(progress);
    await fireEvent.click(contact);
    await fireEvent.input(screen.getByRole("textbox", { name: m.feedback_email_aria() }), {
      target: { value: "reporter@example.com" },
    });
    if (!include) {
      await fireEvent.click(progress);
      await fireEvent.click(contact);
    }
    await fireEvent.click(screen.getByRole("button", { name: m.feedback_send_action() }));
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
  await fireEvent.click(screen.getByRole("button", { name: m.feedback_send_action() }));
  await screen.findByRole("button", { name: m.feedback_copy_action() });
  expect(message).toHaveValue("Keep this report");
  expect(screen.getByRole("dialog", { name: m.toolbar_send_feedback() })).toBeInTheDocument();
});
