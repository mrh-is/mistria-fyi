import { expect } from "@playwright/test";

import type { Page } from "@playwright/test";

export async function openFeedbackValidation(page: Page): Promise<void> {
  const trigger = page
    .getByRole("navigation", { name: "Tracker tools" })
    .getByRole("button", { name: "Send feedback" });
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const dialog = page.getByRole("dialog", { name: "Send feedback" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { exact: true, name: "Send" }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Please enter a message.");
}

export async function openSearch(page: Page, query: string): Promise<void> {
  await page.getByRole("button", { name: "Search" }).click();
  const search = page.getByRole("textbox", { name: "Search items" });
  await search.fill(query);
  await expect(search).toHaveValue(query);
}

export async function openSettingsCard(page: Page, name: string): Promise<void> {
  const trigger = page.getByRole("button", { name: new RegExp(`^${name}`) });
  await expect(trigger).toHaveAttribute("aria-controls", /\S+/);
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
}

export async function openVisibilityPanel(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Visibility filters" }).click();
  await expect(page.getByRole("region", { name: "Filters" })).toBeVisible();
}
