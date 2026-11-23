import type { Page } from "@playwright/test";

interface RenderedCopy {
  source: string;
  text: string;
}

export async function collectRenderedCopy(page: Page): Promise<RenderedCopy[]> {
  return page.evaluate(() => {
    const copy: RenderedCopy[] = [];
    const range = document.createRange();
    const verbatim = "code, kbd, pre, samp, script, style, template, title";
    const attributes = ["aria-label", "title", "placeholder", "alt"];
    let paintedText = "";

    function add(source: string, value: string): void {
      const text = value.replaceAll(/\s+/gu, " ").trim();
      if (text) copy.push({ source, text });
    }

    function flush(block: Element): void {
      add(block.localName, paintedText);
      paintedText = "";
    }

    function visit(element: Element, block: Element, clipped = false): void {
      const style = getComputedStyle(element);
      if (
        style.display === "none" ||
        style.contentVisibility === "hidden" ||
        style.opacity === "0"
      ) {
        return;
      }
      // Tailwind's sr-only text can still name a visible control, but it isn't painted text.
      const visuallyClipped =
        clipped || style.getPropertyValue("clip") === "rect(0px, 0px, 0px, 0px)";
      const visible = style.visibility === "visible" && !visuallyClipped;
      if (element.matches(verbatim)) {
        if (visible) paintedText += " ";
        return;
      }
      if (
        visible &&
        [...element.getClientRects()].some(({ height, width }) => height > 0 && width > 0)
      ) {
        for (const attribute of attributes) {
          add(`${element.localName}[${attribute}]`, element.getAttribute(attribute) ?? "");
        }
      }
      // Inline markup can split one painted word across several DOM text nodes.
      const inline = style.display === "inline" || style.display === "contents";
      const textBlock = inline ? block : element;
      if (visible && (!inline || element.matches("br, img, input, svg, textarea"))) flush(block);
      // In Chromium, descendants of closed details can still report nonempty layout rectangles.
      const closed = element instanceof HTMLDetailsElement && !element.open;
      const summary = closed
        ? [...element.children].find((child) => child.localName === "summary")
        : undefined;
      for (const child of element.childNodes) {
        if (closed && child !== summary) continue;
        if (child instanceof Element) {
          visit(child, textBlock, visuallyClipped);
        } else if (child instanceof Text && visible) {
          range.selectNodeContents(child);
          if ([...range.getClientRects()].some(({ height, width }) => height > 0 && width > 0)) {
            paintedText += child.data;
          }
        }
      }
      if (!inline && !visuallyClipped) flush(textBlock);
    }

    visit(document.body, document.body);
    return copy;
  });
}
