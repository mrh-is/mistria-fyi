import toRuntime from "wuchale/runtime";

import * as source from "./.wuchale/offline.0.en.compiled.js";

import type { Runtime } from "wuchale/runtime";

// Build tools read the original source; test transforms recover the same English copy.
const runtime = toRuntime(source, "en");
export const getRuntime = (): Runtime => runtime;
export const getRuntimeRx = (): Runtime => runtime;
