import "@testing-library/jest-dom/vitest";

import { vi } from "vitest";

if (typeof Element !== "undefined") {
  Element.prototype.animate = vi.fn(
    () =>
      ({
        cancel: vi.fn(),
        onfinish: null,
      }) as unknown as Animation,
  );
}
