import { currentRuntime } from "wuchale/load-utils/server";

export { loadCatalog, loadCount } from "./.wuchale/ui.proxy.sync.js";

export const key = "ui";
export const getRuntime = (id = 0) => currentRuntime(key, id);
export const getRuntimeRx = (id = 0) => getRuntime(id);
