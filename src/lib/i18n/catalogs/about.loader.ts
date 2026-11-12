import { readAboutRuntime } from "../about-ui.js";

import type { Runtime } from "wuchale/runtime";

export const getRuntime = (): Runtime => readAboutRuntime();
export const getRuntimeRx = (): Runtime => readAboutRuntime();
