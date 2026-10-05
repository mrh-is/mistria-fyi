import type { Page } from "@playwright/test";

export interface ElementBox {
  bottom?: number;
  centerX?: number;
  centerY?: number;
  height?: number;
  inline?: boolean;
  label: string;
  left?: number;
  right?: number;
  selector: string;
  top?: number;
  width?: number;
}

export interface OverflowViolation {
  label: string;
  left: number;
  right: number;
  selector: string;
  viewportWidth: number;
}

export interface TargetSizeViolation {
  height: number;
  label: string;
  minimum: number;
  selector: string;
  width: number;
}

export async function collectVisibleElementBoxes(page: Page): Promise<ElementBox[]> {
  return page.locator("body").evaluate(() => {
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- runs inside page.evaluate, so helpers must stay within the serialized callback
    const selectorFor = (element: Element): string => {
      if (element.id) return `#${CSS.escape(element.id)}`;
      const label = element.getAttribute("aria-label");
      if (label) return `${element.tagName.toLowerCase()}[aria-label=${JSON.stringify(label)}]`;
      return element.tagName.toLowerCase();
    };
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- runs inside page.evaluate, so helpers must stay within the serialized callback
    const labelFor = (element: Element): string =>
      element.getAttribute("aria-label") ?? element.textContent.trim().slice(0, 80);
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- runs inside page.evaluate, so helpers must stay within the serialized callback
    const clippedByAncestor = (element: Element, rectangle: DOMRect): boolean => {
      let ancestor = element.parentElement;
      while (ancestor && ancestor !== document.body) {
        const style = getComputedStyle(ancestor);
        if (["auto", "clip", "hidden", "scroll"].includes(style.overflowX)) {
          const bounds = ancestor.getBoundingClientRect();
          if (rectangle.left < bounds.left || rectangle.right > bounds.right) return true;
        }
        ancestor = ancestor.parentElement;
      }
      return false;
    };

    return [...document.body.querySelectorAll("*")].flatMap((element) => {
      const rectangle = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (
        rectangle.width === 0 ||
        rectangle.height === 0 ||
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.clipPath === "inset(50%)" ||
        clippedByAncestor(element, rectangle)
      ) {
        return [];
      }
      return [
        {
          bottom: rectangle.bottom,
          label: labelFor(element),
          left: rectangle.left,
          right: rectangle.right,
          selector: selectorFor(element),
          top: rectangle.top,
        },
      ];
    });
  });
}

export async function collectVisibleTargets(page: Page): Promise<ElementBox[]> {
  return page
    .locator(
      'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="checkbox"], [role="link"], [role="radio"], [role="switch"], [tabindex]:not([tabindex="-1"])',
    )
    .evaluateAll((elements) =>
      elements.flatMap((element) => {
        const rectangle = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        if (
          rectangle.width === 0 ||
          rectangle.height === 0 ||
          style.display === "none" ||
          style.visibility === "hidden" ||
          style.clipPath === "inset(50%)"
        ) {
          return [];
        }
        const parentDisplay = element.parentElement
          ? getComputedStyle(element.parentElement).display
          : "";
        const label = element.getAttribute("aria-label") ?? element.textContent.trim().slice(0, 80);
        const selector = element.id
          ? `#${CSS.escape(element.id)}`
          : `${element.tagName.toLowerCase()}${label ? `[label=${JSON.stringify(label)}]` : ""}`;
        return [
          {
            centerX: rectangle.left + rectangle.width / 2,
            centerY: rectangle.top + rectangle.height / 2,
            height: rectangle.height,
            inline: element.tagName === "A" && parentDisplay === "inline",
            label,
            selector,
            width: rectangle.width,
          },
        ];
      }),
    );
}

export function findOverflow(elements: ElementBox[], viewportWidth: number): OverflowViolation[] {
  return elements.flatMap((element) => {
    if (element.left === undefined || element.right === undefined) return [];
    if (element.left >= -0.5 && element.right <= viewportWidth + 0.5) return [];
    return [
      {
        label: element.label,
        left: element.left,
        right: element.right,
        selector: element.selector,
        viewportWidth,
      },
    ];
  });
}

export function findTargetSizeViolations(
  targets: ElementBox[],
  fortyFourPixelSelectors: ReadonlySet<string> = new Set(),
): TargetSizeViolation[] {
  return targets.flatMap((target) => {
    const height = target.height ?? 0;
    const width = target.width ?? 0;
    const minimum = fortyFourPixelSelectors.has(target.selector) ? 44 : 24;
    const meetsSize = height >= minimum && width >= minimum;
    const hasAaException =
      minimum === 24 && (target.inline === true || hasRequiredSpacing(target, targets));
    if (meetsSize || hasAaException) return [];
    return [{ height, label: target.label, minimum, selector: target.selector, width }];
  });
}

function hasRequiredSpacing(target: ElementBox, allTargets: ElementBox[]): boolean {
  if (target.centerX === undefined || target.centerY === undefined) return false;
  const { centerX, centerY } = target;

  return allTargets.every((other) => {
    if (other === target || other.centerX === undefined || other.centerY === undefined) return true;
    return Math.hypot(other.centerX - centerX, other.centerY - centerY) >= 24;
  });
}
