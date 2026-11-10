import { render, within } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { describe, expect, it } from "vitest";

import ShelfGroups from "#lib/components/shelf-groups.svelte";
import * as m from "#lib/ui-messages/messages.js";

import type { Shelf } from "#lib/engine/shelves.js";

interface Row {
  name: string;
  shelf: Shelf;
}

const group = createRawSnippet<[readonly Row[]]>((rows) => ({
  render: () =>
    `<div>${rows()
      .map(({ name }) => name)
      .join(", ")}</div>`,
}));

describe("ShelfGroups during search", () => {
  it("labels the first shelf when only Not now rows match", async () => {
    const view = render(ShelfGroups<Row>, {
      forceOpen: true,
      getKey: (row: Row) => row.name,
      getShelf: (row: Row) => row.shelf,
      group,
      items: [
        { name: "Turnip", shelf: "todo" },
        { name: "Wild Berries", shelf: "notNow" },
        { name: "Spice Berries", shelf: "notNow" },
      ],
    });
    const todo = within(view.getByRole("group", { name: m.shelf_to_do() }));
    const notNow = within(view.getByRole("group", { name: m.shelf_not_now() }));
    expect(todo.getByRole("heading", { name: m.shelf_to_do() })).toBeVisible();
    expect(todo.getByText("1")).toBeVisible();
    expect(todo.getByText("Turnip")).toBeVisible();
    expect(notNow.getByRole("heading", { name: m.shelf_not_now() })).toBeVisible();
    expect(notNow.getByText("2")).toBeVisible();

    await view.rerender({ items: [{ name: "Wild Berries", shelf: "notNow" }] });

    expect(view.queryByRole("group", { name: m.shelf_to_do() })).toBeNull();
    const onlyMatch = within(view.getByRole("group", { name: m.shelf_not_now() }));
    expect(onlyMatch.getByRole("heading", { name: m.shelf_not_now() })).toBeVisible();
    expect(onlyMatch.getByText("1")).toBeVisible();
    expect(onlyMatch.getByText("Wild Berries")).toBeVisible();

    await view.rerender({ labelFirstShelf: false });

    expect(onlyMatch.queryByRole("heading", { name: m.shelf_not_now() })).toBeNull();
    expect(onlyMatch.getByText("Wild Berries")).toBeVisible();
  });
});
