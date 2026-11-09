import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, it, vi } from "vitest";

import * as m from "#lib/paraglide/messages.js";

import TransferCard from "./transfer-card.svelte";

it("points players to sync and backup restore instead of progress codes", async () => {
  const onOpenBackup = vi.fn();
  render(TransferCard, { onOpenBackup, open: true });

  expect(screen.getByRole("link", { name: m.transfer_sync_action() })).toHaveAttribute(
    "href",
    "/en/sync",
  );
  expect(screen.getByText(/anything you check off by hand/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Generate QR Code" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Scan QR Code" })).not.toBeInTheDocument();
  await fireEvent.click(screen.getByRole("button", { name: m.transfer_open_backup_action() }));
  expect(onOpenBackup).toHaveBeenCalledTimes(1);
});
