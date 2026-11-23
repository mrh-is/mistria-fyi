import type { Attachment } from "svelte/attachments";

interface MeterInputOptions {
  /** Divide the track into equal targets, with a second press on the top mark removing it. */
  discreteMarks?: boolean;
  getValue: () => number;
  majorStep?: number;
  max: number;
  min: number;
  onCommit: (value: number) => void;
  onPreview?: (value: number | undefined) => void;
  orientation?: "horizontal" | "vertical";
  /** Reverse the pointer axis, for example for a mine shaft that increases downwards. */
  reverse?: boolean;
}

/** Attach to the focusable slider spanning the meter's value range. Set touch-action to pan
 * perpendicular to the meter so scrolling can cancel a gesture without committing. */
export function meterInput({
  discreteMarks = false,
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

  function valueAt(fraction: number): number {
    if (!Number.isFinite(fraction)) return getValue();
    const position = (reverse ? 1 - fraction : fraction) * (max - min);
    if (discreteMarks) return bound(min + Math.max(1, Math.floor(position) + 1));
    return bound(min + Math.round(position));
  }

  return (element) => {
    const listeners = new AbortController();
    const { signal } = listeners;
    let pointer: number | undefined;
    let pressedTopMark: number | undefined;

    function pointerFraction(event: PointerEvent): number {
      const rect = element.getBoundingClientRect();
      return orientation === "vertical"
        ? (rect.bottom - event.clientY) / rect.height
        : (event.clientX - rect.left) / rect.width;
    }

    function finish(): void {
      pointer = undefined;
      pressedTopMark = undefined;
      onPreview?.(undefined);
    }

    element.addEventListener(
      "pointerdown",
      (event) => {
        if (pointer !== undefined || !event.isPrimary || event.button !== 0) return;
        element.setPointerCapture(event.pointerId);
        pointer = event.pointerId;
        element.focus({ preventScroll: true });
        const fraction = pointerFraction(event);
        const target = valueAt(fraction);
        if (discreteMarks && fraction >= 0 && fraction <= 1 && target === getValue()) {
          pressedTopMark = target;
        }
        onPreview?.(target);
      },
      { signal },
    );
    element.addEventListener(
      "pointermove",
      (event) => {
        if (event.pointerId !== pointer) return;
        const fraction = pointerFraction(event);
        const target = valueAt(fraction);
        if (target !== pressedTopMark || !(fraction >= 0 && fraction <= 1)) {
          pressedTopMark = undefined;
        }
        onPreview?.(target);
      },
      { signal },
    );
    element.addEventListener(
      "pointerup",
      (event) => {
        if (event.pointerId !== pointer) return;
        const current = getValue();
        const fraction = pointerFraction(event);
        const target = valueAt(fraction);
        const reselected =
          target === pressedTopMark && target === current && fraction >= 0 && fraction <= 1;
        const value = reselected ? bound(target - 1) : target;
        finish();
        if (value !== current) onCommit(value);
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
