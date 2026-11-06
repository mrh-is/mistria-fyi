import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { trackerData } from "#lib/data/index.js";

const INPUT_DIR = fileURLToPath(new URL("../../../pipeline/input", import.meta.url));

describe("mine seal floors", () => {
  it("match the seal rooms the game places on each floor", () => {
    const script = readFileSync(
      path.join(
        INPUT_DIR,
        `v${trackerData.version}`,
        "assets/gml/scripts/GameplaySystems/Dungeon/enter_dungeon.gml",
      ),
      "utf8",
    );
    const rooms = new Map(
      [...script.matchAll(/case (\d+):\s+impl = [\w.]+;\s+gm_room = (rm_\w+);/gu)].map(
        ([, floor, room]) => [Number(floor), room],
      ),
    );
    expect(Object.fromEntries(rooms)).toEqual({
      100: "rm_seridias_chamber",
      20: "rm_water_seal",
      40: "rm_earth_seal",
      60: "rm_fire_seal",
      80: "rm_ruins_seal",
      90: "rm_priestess_quarters",
    });
    expect(trackerData.mines.seals.map(({ floor }) => floor)).toEqual([...rooms.keys()]);
  });
});
