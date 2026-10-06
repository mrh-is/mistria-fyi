import { describe, expect, it } from "vitest";

import { missingLabels } from "./check-guarded-paths.js";

const ui = "src/lib/components/ui/button/button.svelte";
const data = "src/lib/data/tracker-data.json";

describe("missingLabels", () => {
  it("requires shadcn-update for a ui edit & generated-data for the tracker data", () => {
    expect(missingLabels([{ filename: ui }], [])).toHaveLength(1);
    expect(missingLabels([{ filename: data }], [])).toHaveLength(1);
    expect(missingLabels([{ filename: ui }, { filename: data }], [])).toHaveLength(2);
  });

  it("passes with the matching label", () => {
    expect(missingLabels([{ filename: ui }], ["shadcn-update"])).toEqual([]);
    expect(missingLabels([{ filename: data }], ["generated-data"])).toEqual([]);
  });

  it("does not accept the other path's label", () => {
    expect(missingLabels([{ filename: ui }], ["generated-data"])).toHaveLength(1);
  });

  it("gates a rename out of a guarded path", () => {
    expect(
      missingLabels([{ filename: "src/lib/components/button.svelte", previous_filename: ui }], []),
    ).toHaveLength(1);
    expect(
      missingLabels([{ filename: "src/lib/data/other.json", previous_filename: data }], []),
    ).toHaveLength(1);
  });

  it("gates a rename into a guarded path", () => {
    expect(
      missingLabels([{ filename: ui, previous_filename: "src/button.svelte" }], []),
    ).toHaveLength(1);
  });

  it("ignores unrelated & lookalike paths", () => {
    expect(
      missingLabels(
        [
          { filename: "src/lib/components/ui-kit/a.svelte" },
          { filename: "src/lib/data/tracker-data.json.md" },
          { filename: "a.ts", previous_filename: "b.ts" },
        ],
        [],
      ),
    ).toEqual([]);
  });
});
