import toRuntime from "wuchale/runtime";

import * as source from "./.wuchale/offline.0.en.compiled.js";

// Build tools read the original source; test transforms recover the same English copy.
const runtime = toRuntime(source, "en");
export const getRuntime = () => runtime;
export const getRuntimeRx = () => runtime;
