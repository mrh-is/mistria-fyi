import path from "node:path";
import { describe, expect, it } from "vitest";

import { shuffleSharedClientFiles } from "./vitest-client-sequencer.js";

describe("shared client file shuffle", () => {
  const root = path.join("root");
  const client = (name: string) => ({
    moduleId: path.join(root, "src", `${name}.client.test.ts`),
    project: { name: "client" },
  });
  const relay = { moduleId: path.join(root, "relay", "worker.test.ts"), project: { name: "node" } };
  const app = { moduleId: path.join(root, "src", "app.test.ts"), project: { name: "app" } };
  const clients = ["a", "b", "c", "d", "e", "f", "g", "h"].map((name) => client(name));
  const files = [app, ...clients.slice(0, 4), relay, ...clients.slice(4)];

  it("moves client files only within the slots they already held", () => {
    const shuffled = shuffleSharedClientFiles(files, 496, root);
    expect(shuffled[0]).toBe(app);
    expect(shuffled[5]).toBe(relay);
    expect(shuffled.filter((file) => file.project.name === "client")).not.toEqual(clients);
    expect(new Set(shuffled)).toEqual(new Set(files));
    expect(shuffled).toHaveLength(files.length);
  });

  it("repeats an order for a seed, whatever order the files arrive in", () => {
    const order = (input: typeof files, seed: number) =>
      shuffleSharedClientFiles(input, seed, root).filter(
        ({ project }) => project.name === "client",
      );
    expect(order(files, 496)).toEqual(order(files.toReversed(), 496));
    expect(order(files, 496)).not.toEqual(order(files, 17));
  });
});
