import { expect, it, vi } from "vitest";

import { meterInput } from "#lib/attachments/meter-input.js";

it("previews a drag, commits once on release, and discards a canceled drag", () => {
  const element = document.createElement("div");
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(new DOMRect(10, 20, 120, 40));
  Object.defineProperty(element, "setPointerCapture", { value: vi.fn() });
  const onPreview = vi.fn();
  const onCommit = vi.fn();
  const detach = meterInput({ getValue: () => 0, max: 60, min: 0, onCommit, onPreview })(element);
  function pointer(type: string, clientX: number): void {
    element.dispatchEvent(new PointerEvent(type, { clientX, isPrimary: true, pointerId: 1 }));
  }

  pointer("pointerdown", 30);
  pointer("pointermove", 70);
  element.dispatchEvent(new KeyboardEvent("keydown", { key: "End" }));
  expect(onPreview.mock.calls).toEqual([[10], [30]]);
  expect(onCommit).not.toHaveBeenCalled();
  pointer("pointerup", 130);
  pointer("lostpointercapture", 130);
  expect(onPreview).toHaveBeenLastCalledWith(undefined);
  expect(onCommit).toHaveBeenCalledExactlyOnceWith(60);

  pointer("pointerdown", 110);
  pointer("pointercancel", 110);
  expect(onPreview).toHaveBeenLastCalledWith(undefined);
  expect(onCommit).toHaveBeenCalledTimes(1);
  if (typeof detach === "function") detach();
});
