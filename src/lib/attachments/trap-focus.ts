import type { Attachment } from "svelte/attachments";

const FOCUSABLE_SELECTOR = "a[href], button, textarea, input, select, [tabindex]";
const traps: HTMLElement[] = [];

function canFocus(element: HTMLElement): boolean {
  if (
    element.tabIndex < 0 ||
    element.matches(":disabled") ||
    element.closest("[hidden], [inert]")
  ) {
    return false;
  }
  for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
    const style = getComputedStyle(ancestor);
    if (style.display === "none" || style.visibility === "hidden") return false;
  }
  return true;
}

/** Contain panel keyboard navigation; the caller owns initial focus and restoration. */
export function trapFocus(onClose: () => void): Attachment<HTMLElement> {
  return (element) => {
    traps.push(element);
    function handleKeydown(event: KeyboardEvent): void {
      if (event.defaultPrevented || traps.at(-1) !== element) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...element.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
        (candidate) => canFocus(candidate),
      );
      const first = focusable.at(0);
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      const activeElement = document.activeElement;
      if (event.shiftKey && (activeElement === first || !element.contains(activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (activeElement === last || !element.contains(activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }
    globalThis.addEventListener("keydown", handleKeydown);
    return () => {
      globalThis.removeEventListener("keydown", handleKeydown);
      const index = traps.indexOf(element);
      if (index !== -1) traps.splice(index, 1);
    };
  };
}
