import { expect, test } from "../browser/test.js";
import {
  createStoredState,
  gotoApplication,
  initializeApplication,
  waitForRendering,
} from "./support/application-state.js";
import { requireBox } from "./support/boxes.js";
import { openFeedbackValidation, openVisibilityPanel } from "./support/scenarios.js";
import { critical } from "./support/tags.js";

test.describe("browser accessibility preferences", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`theme, season, and weather share an inset hover outline in ${theme} mode`, async ({
      page,
    }) => {
      await initializeApplication(page, theme);
      await gotoApplication(page, "/");

      await page.getByRole("button", { name: "Quick settings" }).click();
      const settings = page.getByRole("dialog", { name: "Quick settings" });
      const themeOption = settings.getByRole("radio", { name: "Auto" });
      await waitForRendering(page);
      const before = await requireBox(themeOption);
      await themeOption.hover();
      await expect(themeOption).toHaveCSS("outline-style", "solid");
      await expect(themeOption).toHaveCSS("outline-width", "2px");
      await expect(themeOption).toHaveCSS("outline-offset", "-2px");
      await expect(themeOption).toHaveAttribute("aria-checked", "false");
      expect(await requireBox(themeOption)).toEqual(before);
      const color = await themeOption.evaluate((option) => getComputedStyle(option).outlineColor);
      await page.mouse.move(0, 0);
      await expect(themeOption).toHaveCSS("outline-style", "none");
      await settings.getByRole("button", { name: "Close Quick settings" }).click();

      await page.getByRole("button", { name: /^Season & weather/ }).click();
      const clock = page.getByRole("dialog", { name: "Season & weather" });
      for (const name of ["Summer", "Rain"]) {
        const option = clock.getByRole("radio", { name });
        await option.hover();
        await expect(option).toHaveCSS("outline-style", "solid");
        await expect(option).toHaveCSS("outline-offset", "-2px");
        await expect(option).toHaveCSS("outline-color", color);
        await expect(option).toHaveAttribute("aria-checked", "false");
      }
    });
  }

  test(
    "reduced motion removes non-essential animation but preserves feedback",
    critical,
    async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await initializeApplication(page, "light");
      await gotoApplication(page, "/almanac");
      await openVisibilityPanel(page);
      // Inspect durations before settling: waiting first would conceal a full-duration regression.
      const finiteDurations = await page.evaluate(() =>
        document.getAnimations().flatMap((animation) => {
          const timing = animation.effect?.getComputedTiming();
          return timing?.iterations === Infinity ? [] : [timing?.activeDuration];
        }),
      );
      // The reduced-motion stylesheet uses a 0.01 ms duration, rather than zero, to retain events.
      expect(
        finiteDurations.every((duration) => typeof duration === "number" && duration <= 0.01),
      ).toBe(true);
      await waitForRendering(page);

      const activeFiniteAnimations = await page.evaluate(() =>
        document.getAnimations().flatMap((animation) => {
          const timing = animation.effect?.getComputedTiming();
          if (timing?.iterations === Infinity || timing?.activeDuration === 0) return [];
          const target =
            animation.effect instanceof KeyframeEffect ? animation.effect.target : null;
          return [
            {
              activeDuration: timing?.activeDuration,
              target: target instanceof Element ? target.outerHTML.slice(0, 200) : null,
            },
          ];
        }),
      );
      expect(activeFiniteAnimations).toEqual([]);

      await gotoApplication(page, "/");
      await openFeedbackValidation(page);
      await expect(page.getByRole("alert")).toHaveText("What did you wanna say?");
    },
  );

  test("forced colors retain focus and state boundaries", critical, async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await initializeApplication(page, "light", createStoredState());
    await gotoApplication(page, "/almanac");
    const artifacts = page.getByRole("button", { name: /^Artifacts, 0 of \d+ completed/ });
    await artifacts.focus();
    await artifacts.press("Enter");
    await expect(artifacts).toHaveAttribute("aria-expanded", "true");
    await waitForRendering(page);
    await page.keyboard.press("Tab");
    const completion = page.getByRole("button", { name: /^Check / }).first();
    await expect(completion).toBeFocused();

    expect(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(true);
    const focusStyle = await completion.evaluate((element) => {
      const style = getComputedStyle(element);
      return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
    });
    expect(focusStyle.outlineStyle).not.toBe("none");
    // oxlint-disable-next-line unicorn/prefer-number-coercion -- computed style values carry a "px" suffix that Number() rejects
    expect(Number.parseFloat(focusStyle.outlineWidth)).toBeGreaterThan(0);

    await completion.press("Space");
    await expect(page.getByRole("button", { exact: true, name: "Undo" })).toBeVisible();
  });
});
