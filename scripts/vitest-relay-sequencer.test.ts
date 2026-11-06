import path from "node:path";
import { describe, expect, it } from "vitest";

import { prioritizeRelay, shuffleSharedClientFiles } from "./vitest-relay-sequencer.js";

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

describe("shared client file shuffle", () => {
  const root = path.join("root");
  const client = (name: string) => ({
    moduleId: path.join(root, "src", `${name}.client.test.ts`),
    project: { name: "client" },
  });
  const relay = { moduleId: path.join(root, "relay", "worker.test.ts"), project: { name: "node" } };
  const app = { moduleId: path.join(root, "src", "app.test.ts"), project: { name: "app" } };
  const clients = ["a", "b", "c", "d", "e", "f", "g", "h"].map((name) => client(name));
  const files = [relay, ...clients.slice(0, 4), app, ...clients.slice(4)];

  it("moves client files only within the slots they already held", () => {
    const shuffled = shuffleSharedClientFiles(files, 496, root);
    expect(shuffled[0]).toBe(relay);
    expect(shuffled[5]).toBe(app);
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
