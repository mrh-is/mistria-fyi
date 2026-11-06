import { describe, expect, it } from "vitest";

import {
  addProgress,
  alwaysToDo,
  countShelfRows,
  emptyProgress,
  filteredCounts,
  progressShelf,
  rowShelf,
} from "./shelves.js";

import type { ShelfRow } from "./shelves.js";

const todo: ShelfRow = { completed: false, doable: true, doableAnywhere: true, shown: true };
const waiting: ShelfRow = { completed: false, doable: false, doableAnywhere: false, shown: true };
const done: ShelfRow = { completed: true, doable: false, doableAnywhere: false, shown: true };
/** Doable only through a source the filters hide, though another source keeps it on the page. */
const doableElsewhere: ShelfRow = { ...waiting, doableAnywhere: true };
const hiddenTodo: ShelfRow = { ...doableElsewhere, shown: false };
const hiddenWaiting: ShelfRow = { ...waiting, shown: false };
const hiddenDone: ShelfRow = { ...done, shown: false };

function shelf(...rows: ShelfRow[]): ReturnType<typeof progressShelf> {
  return progressShelf(countShelfRows(rows));
}

describe("rowShelf", () => {
  it.each([
    ["todo", todo],
    ["notNow", waiting],
    ["notNow", doableElsewhere],
    ["completed", done],
  ] as const)("puts a shown row on %s", (expected, row) => {
    expect(rowShelf(row)).toBe(expected);
  });

  it.each([hiddenTodo, hiddenWaiting, hiddenDone])("takes a filtered row off the page", (row) => {
    expect(rowShelf(row)).toBeUndefined();
  });
});

describe("progressShelf", () => {
  it("is To do with one unfinished row doable through a shown source", () => {
    expect(shelf(done, waiting, todo)).toBe("todo");
  });

  it("is Not now with unfinished shown rows, none doable", () => {
    expect(shelf(done, waiting)).toBe("notNow");
    expect(shelf(doableElsewhere)).toBe("notNow");
  });

  it("is Completed with every row finished & one matching the filters", () => {
    expect(shelf(done, hiddenDone)).toBe("completed");
  });

  it("leaves the page with every finished row filtered out", () => {
    expect(shelf(hiddenDone)).toBeUndefined();
  });

  it("leaves the page with finished rows shown but unfinished rows filtered out", () => {
    expect(shelf(done, hiddenWaiting)).toBeUndefined();
    expect(shelf(done, hiddenTodo)).toBeUndefined();
  });
});

describe("countShelfRows", () => {
  it("keeps the full total & completed count, whatever the filters show", () => {
    expect(countShelfRows([todo, waiting, done, hiddenDone, hiddenTodo])).toEqual({
      completed: 2,
      completedShown: 1,
      todo: 1,
      total: 5,
      waiting: 1,
    });
  });
});

describe("addProgress", () => {
  it("sums every field, so a parent's shelf matches its parts", () => {
    const sum = addProgress([countShelfRows([todo, done]), countShelfRows([waiting])]);
    expect(sum).toEqual({ completed: 1, completedShown: 1, todo: 1, total: 3, waiting: 1 });
  });

  it("starts empty", () => {
    expect(addProgress([])).toEqual(emptyProgress());
  });
});

describe("alwaysToDo", () => {
  it("is To do until finished, then Completed", () => {
    expect(progressShelf(alwaysToDo(3, 5))).toBe("todo");
    expect(progressShelf(alwaysToDo(5, 5))).toBe("completed");
  });
});

describe("filteredCounts", () => {
  it("counts what the filters took from each shelf", () => {
    expect(
      filteredCounts([todo, waiting, done, doableElsewhere, hiddenTodo, hiddenWaiting, hiddenDone]),
    ).toEqual({ completed: 1, notNow: 1, todo: 2 });
  });

  it("is empty when nothing is filtered", () => {
    expect(filteredCounts([todo, waiting, done])).toEqual({ completed: 0, notNow: 0, todo: 0 });
  });
});
