import { expect, test } from "../browser/test.js";

test.use({ javaScriptEnabled: false });

test("Data management is rendered but excluded from indexing", async ({ page }) => {
  const response = await page.goto("/en/data");

  expect(response?.ok()).toBe(true);
  await expect(page).toHaveTitle("Data management — Mistria Field Guide");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, follow");
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Data management" })).toBeVisible();
});
