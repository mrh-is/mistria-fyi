import type { Attachment } from "svelte/attachments";

interface MeterInputOptions {
  getValue: () => number;
  majorStep?: number;
  max: number;
  min: number;
  onCommit: (value: number) => void;
  onPreview: (value: number | undefined) => void;
  orientation?: "horizontal" | "vertical";
  /** Reverse the pointer axis, for example for a mine shaft that increases downwards. */
  reverse?: boolean;
}

/** Attach to the focusable slider spanning the meter's value range. Set touch-action to pan
 * perpendicular to the meter so scrolling can cancel a gesture without committing. */
export function meterInput({
  getValue,
  majorStep,
  max,
  min,
  onCommit,
  onPreview,
  orientation = "horizontal",
  reverse = false,
}: MeterInputOptions): Attachment<HTMLElement> {
  const bound = (value: number): number => Math.min(max, Math.max(min, value));

  return (element) => {
    const listeners = new AbortController();
    const { signal } = listeners;
    let pointer: number | undefined;

    function valueAt(event: PointerEvent): number {
      const rect = element.getBoundingClientRect();
      const fraction =
        orientation === "vertical"
          ? (rect.bottom - event.clientY) / rect.height
          : (event.clientX - rect.left) / rect.width;
      if (!Number.isFinite(fraction)) return getValue();
      return bound(Math.round(min + (reverse ? 1 - fraction : fraction) * (max - min)));
    }

    function finish(): void {
      pointer = undefined;
      onPreview(undefined);
    }

    element.addEventListener(
      "pointerdown",
      (event) => {
        if (pointer !== undefined || !event.isPrimary || event.button !== 0) return;
        pointer = event.pointerId;
        element.setPointerCapture(pointer);
        element.focus({ preventScroll: true });
        onPreview(valueAt(event));
      },
      { signal },
    );
    element.addEventListener(
      "pointermove",
      (event) => {
        if (event.pointerId === pointer) onPreview(valueAt(event));
      },
      { signal },
    );
    element.addEventListener(
      "pointerup",
      (event) => {
        if (event.pointerId !== pointer) return;
        const value = valueAt(event);
        finish();
        if (value !== getValue()) onCommit(value);
      },
      { signal },
    );
    const cancel = (event: PointerEvent): void => {
      if (event.pointerId === pointer) finish();
    };
    element.addEventListener("pointercancel", cancel, { signal });
    element.addEventListener("lostpointercapture", cancel, { signal });

    element.addEventListener(
      "keydown",
      (event) => {
        if (event.altKey || event.ctrlKey || event.metaKey || pointer !== undefined) return;
        const current = getValue();
        let value: number;
        switch (event.key) {
          case "ArrowRight":
          case "ArrowUp":
            value = current + 1;
            break;
          case "ArrowLeft":
          case "ArrowDown":
            value = current - 1;
            break;
          case "PageUp":
            if (majorStep === undefined) return;
            value = current + majorStep;
            break;
          case "PageDown":
            if (majorStep === undefined) return;
            value = current - majorStep;
            break;
          case "Home":
            value = min;
            break;
          case "End":
            value = max;
            break;
          default:
            return;
        }
        event.preventDefault();
        const next = bound(value);
        if (next !== current) onCommit(next);
      },
      { signal },
    );

    return () => {
      listeners.abort();
      if (pointer !== undefined) {
        if (element.hasPointerCapture(pointer)) element.releasePointerCapture(pointer);
        finish();
      }
    };
  };
}
