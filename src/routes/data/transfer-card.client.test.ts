import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, it, vi } from "vitest";

import TransferCard from "./transfer-card.svelte";

it("points players to sync and backup restore instead of progress codes", async () => {
  const onOpenBackup = vi.fn();
  render(TransferCard, { onOpenBackup, open: true });

  expect(screen.getByRole("link", { name: "Set up sync" })).toHaveAttribute("href", "/en/sync");
  expect(screen.getByText(/anything you check off by hand/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Generate QR Code" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Scan QR Code" })).not.toBeInTheDocument();
  await fireEvent.click(screen.getByRole("button", { name: "Open Backup & Restore" }));
  expect(onOpenBackup).toHaveBeenCalledTimes(1);
});
