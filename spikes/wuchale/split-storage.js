/// <reference types="node" />

import path from "node:path";
import { normalizeSep } from "wuchale";

import { partitionedStorage } from "../../scripts/lib/wuchale-storage.js";

// Fixed names let Wuchale register every catalog with its watcher before extraction.
const shards = ["search", "settings", "shared"];

/** @param {import("wuchale").Item} item */
function shardFor(item) {
  const features = new Set(
    item.references.map(({ file }) => {
      const feature = path.posix.dirname(normalizeSep(file)).split("/")[2];
      if (feature !== "search" && feature !== "settings") {
        throw new Error(`Unknown catalog owner: ${file}`);
      }
      return feature;
    }),
  );
  return features.size === 1 ? [...features][0] : "shared";
}

export const splitStorage = partitionedStorage(shards, shardFor);
