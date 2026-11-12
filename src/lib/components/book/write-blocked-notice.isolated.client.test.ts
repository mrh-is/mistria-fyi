import { cleanup, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as m from "#lib/paraglide/messages.js";

import type { PersistenceFailureKind } from "#lib/stores/user-state.svelte.js";

const failure = vi.hoisted(() => ({ failed: true, kind: "newer-data" as PersistenceFailureKind }));

vi.mock("#lib/stores/user-state.svelte.js", () => ({
  userState: {
    get persistenceFailed() {
      return failure.failed;
    },
    get persistenceFailureKind() {
      return failure.kind;
    },
  },
}));

const { default: WriteBlockedNotice } = await import("./write-blocked-notice.svelte");

afterEach(() => {
  cleanup();
  failure.failed = true;
});

function show(kind: PersistenceFailureKind): void {
  failure.kind = kind;
  render(WriteBlockedNotice);
}

describe("WriteBlockedNotice", () => {
  it("holds newer data at the top of the page, with a way to reload", () => {
    show("newer-data");
    expect(screen.getByRole("alert")).toHaveTextContent(m.persistence_warning_newer_data());
    expect(screen.getByRole("button", { name: m.book_notice_reload() })).toBeInTheDocument();
  });

  it("explains a load the browser refused, & offers a reload", () => {
    show("load-blocked");
    expect(screen.getByRole("alert")).toHaveTextContent(m.persistence_warning_load_title());
    expect(screen.getByRole("button", { name: m.book_notice_reload() })).toBeInTheDocument();
  });

  it("sends unreadable data to Data, where it can be downloaded", () => {
    show("unreadable");
    expect(screen.getByRole("link", { name: m.data_title() })).toHaveAttribute("href", "/en/data");
  });

  it("stays out of the way of a failed save, which is a toast", () => {
    show("unavailable");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows nothing while storage is healthy", () => {
    failure.failed = false;
    show("newer-data");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
