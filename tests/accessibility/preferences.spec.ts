import { expect, test } from "@playwright/test";

import { createStoredState, initializeApplication } from "./support/application-state.js";
import { openFeedbackValidation, openVisibilityPanel } from "./support/scenarios.js";

test.describe("@critical browser accessibility preferences", () => {
  test("reduced motion removes non-essential animation but preserves feedback", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await initializeApplication(page, "light");
    await page.goto("/almanac");
    await openVisibilityPanel(page);
    await page.getByRole("button", { name: /Seasonality/ }).click();

    const activeFiniteAnimations = await page.evaluate(() =>
      document.getAnimations().flatMap((animation) => {
        const timing = animation.effect?.getComputedTiming();
        if (timing?.iterations === Infinity || timing?.activeDuration === 0) return [];
        const target = animation.effect instanceof KeyframeEffect ? animation.effect.target : null;
        return [
          {
            activeDuration: timing?.activeDuration,
            target: target instanceof Element ? target.outerHTML.slice(0, 200) : null,
          },
        ];
      }),
    );
    expect(activeFiniteAnimations).toEqual([]);

    await page.goto("/");
    await openFeedbackValidation(page);
    await expect(page.getByRole("alert")).toHaveText("Please enter a message.");
  });

  test("forced colors retain focus and state boundaries", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await initializeApplication(
      page,
      "light",
      createStoredState({ availabilityMode: "everything" }),
    );
    await page.goto("/almanac");
    const artifacts = page.getByRole("button", { name: /^Artifacts 0\/\d+$/ });
    await artifacts.focus();
    await artifacts.press("Enter");
    await page.keyboard.press("Tab");
    const completion = page.getByRole("button", { name: /^Check / }).first();
    await expect(completion).toBeFocused();

    expect(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(true);
    const focusStyle = await completion.evaluate((element) => {
      const style = getComputedStyle(element);
      return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
    });
    expect(focusStyle.outlineStyle).not.toBe("none");
    expect(Number.parseFloat(focusStyle.outlineWidth)).toBeGreaterThan(0);

    await completion.press("Space");
    await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
  });
});
