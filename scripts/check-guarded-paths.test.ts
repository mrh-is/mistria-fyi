import { describe, expect, it } from "vitest";

import { missingDataDiff, missingLabels } from "./check-guarded-paths.js";

const data = "src/lib/data/tracker-data.json";

describe("missingLabels", () => {
  it("requires generated-data for the tracker data", () => {
    expect(missingLabels([{ filename: data }], [])).toHaveLength(1);
  });

  it("passes with the matching label", () => {
    expect(missingLabels([{ filename: data }], ["generated-data"])).toEqual([]);
  });

  it("does not accept the retired shadcn-update label", () => {
    expect(missingLabels([{ filename: data }], ["shadcn-update"])).toHaveLength(1);
  });

  it("leaves the project-owned ui components unguarded", () => {
    expect(missingLabels([{ filename: "src/lib/components/ui/button/button.svelte" }], [])).toEqual(
      [],
    );
  });

  it("gates a rename out of the guarded path", () => {
    expect(
      missingLabels([{ filename: "src/lib/data/other.json", previous_filename: data }], []),
    ).toHaveLength(1);
  });

  it("gates a rename into the guarded path", () => {
    expect(
      missingLabels([{ filename: data, previous_filename: "src/data.json" }], []),
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

describe("missingDataDiff", () => {
  const summary =
    "Tracker data changes from origin/main to the working copy:\n3 added, 0 removed, 1 changed";

  it("requires data:diff output when the tracker data changes", () => {
    expect(missingDataDiff([{ filename: data }], "Closes #1")).toHaveLength(1);
  });

  it("accepts the data:diff summary line, inside a details block or not", () => {
    expect(missingDataDiff([{ filename: data }], summary)).toEqual([]);
    expect(
      missingDataDiff([{ filename: data }], `<details>\n\n\`\`\`\n${summary}\n\`\`\`\n</details>`),
    ).toEqual([]);
  });

  it("ignores PRs that leave the tracker data alone", () => {
    expect(missingDataDiff([{ filename: "src/app.css" }], "")).toEqual([]);
  });
});
