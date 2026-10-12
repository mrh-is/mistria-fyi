import type { Attachment } from "svelte/attachments";

/**
 * Mirror the visual viewport's top offset and height onto the element as
 * `--visual-viewport-top` and `--visual-viewport-height`. iOS Safari shrinks only the visual
 * viewport when the on-screen keyboard opens and scrolls it within the layout viewport, so a
 * layout-anchored element (sticky or `100dvh`) slides off screen; these properties let CSS pin
 * an element to the part of the page the reader can actually see.
 */
export const trackVisualViewport: Attachment<HTMLElement> = (element) => {
  const viewport = window.visualViewport;
  if (!viewport) return;

  function update(): void {
    if (!viewport) return;
    element.style.setProperty("--visual-viewport-top", `${viewport.offsetTop}px`);
    element.style.setProperty("--visual-viewport-height", `${viewport.height}px`);
  }

  update();
  viewport.addEventListener("resize", update);
  viewport.addEventListener("scroll", update);
  return () => {
    viewport.removeEventListener("resize", update);
    viewport.removeEventListener("scroll", update);
    element.style.removeProperty("--visual-viewport-top");
    element.style.removeProperty("--visual-viewport-height");
  };
};
