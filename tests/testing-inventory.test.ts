import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Keeps `docs/testing-inventory.md`'s coverage tables honest: every component appears in them, and
 * a row naming one component marks "Server" & "happy-dom" exactly when that component's
 * `*.test.ts` & `*.client.test.ts` files (or their `.isolated` variants) exist.
 */

const root = join(import.meta.dirname, "..");
const componentsDirectory = join(root, "src/lib/components");
const inventory = readFileSync(join(root, "docs/testing-inventory.md"), "utf8");

interface InventoryRow {
  clientTest: boolean;
  names: string[];
  serverTest: boolean;
}

function inventoryRows(): InventoryRow[] {
  const coverage = inventory.slice(inventory.indexOf("## Coverage by component"));
  return coverage
    .split("\n")
    .filter((line) => line.startsWith("| `"))
    .map((line) => {
      const [names = "", server = "", client = ""] = line.split("|").slice(1);
      return {
        clientTest: client.trim() === "✓",
        names: [...names.matchAll(/`([^`]+)`/gu)].map(([, name]) => name),
        serverTest: server.trim() === "✓",
      };
    });
}

function components(): string[] {
  return readdirSync(componentsDirectory)
    .filter((file) => file.endsWith(".svelte") && !file.endsWith(".test-harness.svelte"))
    .map((file) => basename(file, ".svelte"));
}

function isListed(component: string, names: string[]): boolean {
  // A name with `*` (such as `animal-*-section`) is a wildcard over component names.
  return names.some((name) =>
    name.includes("*")
      ? new RegExp(`^${name.replaceAll("*", ".*")}$`, "u").test(component)
      : name === component,
  );
}

describe("testing inventory", () => {
  it("lists every component", () => {
    const names = inventoryRows().flatMap((row) => row.names);
    expect(components().filter((component) => !isListed(component, names))).toEqual([]);
  });

  it("marks test layers that match the test files on disk", () => {
    const mismatches = inventoryRows()
      .filter((row) => row.names.length === 1 && components().includes(row.names[0] ?? ""))
      .flatMap(({ clientTest, names: [name = ""], serverTest }) => {
        const exists = (...suffixes: string[]) =>
          suffixes.some((suffix) => existsSync(join(componentsDirectory, `${name}${suffix}`)));
        const hasServerTest = exists(".test.ts", ".isolated.test.ts");
        const hasClientTest = exists(".client.test.ts", ".isolated.client.test.ts");
        return [
          ...(hasServerTest === serverTest ? [] : [`${name}: Server should be ${hasServerTest}`]),
          ...(hasClientTest === clientTest
            ? []
            : [`${name}: happy-dom should be ${hasClientTest}`]),
        ];
      });
    expect(mismatches).toEqual([]);
  });
});
