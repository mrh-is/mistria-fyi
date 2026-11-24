import { describe, expect, it } from "vitest";

import { resolveUpdates } from "#scripts/issue-fields";

import type { Catalog } from "#scripts/issue-fields";

const catalog: Catalog = {
  fields: [
    {
      id: "F_AGENT",
      name: "Agent",
      options: [
        { id: "O_CLAUDE", name: "Claude" },
        { id: "O_CODEX", name: "Codex" },
      ],
    },
  ],
  statuses: [
    { id: "S_TODO", name: "Todo" },
    { id: "S_PROGRESS", name: "In progress" },
  ],
  types: [{ id: "T_BUG", name: "Bug" }],
};

describe("resolveUpdates", () => {
  it("resolves names without regard to case", () => {
    expect(resolveUpdates(["status=in progress", "type=bug", "AGENT=codex"], catalog)).toEqual([
      { kind: "status", statusId: "S_PROGRESS" },
      { kind: "type", typeId: "T_BUG" },
      { fieldId: "F_AGENT", kind: "field", optionId: "O_CODEX" },
    ]);
  });

  it("clears a type or field with a dash", () => {
    expect(resolveUpdates(["type=-", "agent=-"], catalog)).toEqual([
      { kind: "type", typeId: null },
      { fieldId: "F_AGENT", kind: "field", optionId: null },
    ]);
  });

  it.each([
    ["status=Shipped", 'Unknown status "Shipped"'],
    ["priority=High", 'Unknown name "priority"'],
    ["agent=Kilo", 'Unknown Agent "Kilo"'],
    ["status=-", "can't be cleared"],
    ["status", "Expected name=value"],
  ])("rejects %s", (assignment, message) => {
    expect(() => resolveUpdates([assignment], catalog)).toThrow(message);
  });
});
