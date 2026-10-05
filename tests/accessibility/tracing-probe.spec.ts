import { expect, test } from "@playwright/test";

for (const scenario of ["success", "recovered", "persistent"]) {
  test(`temporary trace diagnostic: ${scenario}`, async ({ page }, testInfo) => {
    await page.setContent("<button>Ready</button>");
    await expect(page.getByRole("button", { name: "Ready" })).toBeVisible();
    expect(scenario === "success" || (scenario === "recovered" && testInfo.retry > 0)).toBe(true);
  });
}
