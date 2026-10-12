import { describe, expect, it, vi } from "vitest";

import { imageError } from "#lib/attachments/image-error.js";

function imageInState(state: { complete: boolean; naturalWidth: number }): HTMLImageElement {
  const image = document.createElement("img");
  Object.defineProperty(image, "complete", { value: state.complete });
  Object.defineProperty(image, "naturalWidth", { value: state.naturalWidth });
  return image;
}

describe("imageError", () => {
  it("reports an image that failed before it attached", () => {
    const onError = vi.fn();
    imageError(onError)(imageInState({ complete: true, naturalWidth: 0 }));
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("leaves a loaded image alone", () => {
    const onError = vi.fn();
    imageError(onError)(imageInState({ complete: true, naturalWidth: 44 }));
    expect(onError).not.toHaveBeenCalled();
  });

  it("reports a later failure", () => {
    const onError = vi.fn();
    const image = imageInState({ complete: false, naturalWidth: 0 });
    imageError(onError)(image);
    image.dispatchEvent(new Event("error"));
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("stops listening once detached", () => {
    const onError = vi.fn();
    const image = imageInState({ complete: false, naturalWidth: 0 });
    const detach = imageError(onError)(image);
    if (typeof detach === "function") detach();
    image.dispatchEvent(new Event("error"));
    expect(onError).not.toHaveBeenCalled();
  });
});
