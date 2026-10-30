import path from "node:path";
import { describe, expect, it } from "vitest";

import { prioritizeRelay } from "./vitest-relay-sequencer.js";

describe("Workers runtime scheduling", () => {
  it("starts the real relay integration first & preserves every other file’s relative order", () => {
    const files = [
      { moduleId: path.join("root", "src", "large.test.ts") },
      { moduleId: path.join("root", "scripts", "worker.test.ts") },
      { moduleId: path.join("root", "relay", "worker.test.ts") },
      { moduleId: path.join("root", "src", "small.test.ts") },
    ];
    expect(
      files.filter((file) => path.basename(path.dirname(file.moduleId)) === "relay"),
    ).toHaveLength(1);
    expect(prioritizeRelay(files)).toEqual([files[2], files[0], files[1], files[3]]);
    expect(files[0].moduleId).toBe(path.join("root", "src", "large.test.ts"));
  });

  it("preserves the default order when the relay integration is absent", () => {
    const files = [
      { moduleId: path.join("root", "relay", "other.test.ts") },
      { moduleId: path.join("root", "scripts", "worker.test.ts") },
    ];
    expect(prioritizeRelay(files)).toEqual(files);
    expect(prioritizeRelay([])).toEqual([]);
  });
});
