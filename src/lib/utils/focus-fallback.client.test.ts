import { afterEach, beforeEach, expect, it } from "vitest";

import { captureFocusFallback } from "./focus-fallback.js";

const button = (id: string, trigger = true) => {
  const element = document.createElement("button");
  element.id = id;
  if (trigger) element.dataset.sectionTrigger = "";
  document.body.append(element);
  return element;
};

let before: HTMLElement;
let row: HTMLElement;
let after: HTMLElement;

beforeEach(() => {
  before = button("before");
  row = button("row", false);
  after = button("after");
  row.focus();
});

afterEach(() => {
  document.body.replaceChildren();
});

it("gives focus back to an element that moved & lost it", async () => {
  const restore = captureFocusFallback();
  row.blur();
  await restore();
  expect(document.activeElement).toBe(row);
});

it("moves focus to the next trigger when the focused element leaves the page", async () => {
  const restore = captureFocusFallback();
  row.remove();
  await restore();
  expect(document.activeElement).toBe(after);
});

it("skips triggers that are hidden & falls back to the closest earlier one", async () => {
  const restore = captureFocusFallback();
  row.hidden = true;
  after.hidden = true;
  await restore();
  expect(document.activeElement).toBe(before);
});

it("leaves focus alone when something else took it", async () => {
  const restore = captureFocusFallback();
  before.focus();
  row.remove();
  await restore();
  expect(document.activeElement).toBe(before);
});
