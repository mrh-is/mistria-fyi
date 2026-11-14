import "#scripts/lib/require-pinned-node";

import { fileURLToPath } from "node:url";
import { getConfig, Hub } from "wuchale";

const root = fileURLToPath(new URL("..", import.meta.url));
const config = await getConfig(fileURLToPath(new URL("../wuchale.config.ts", import.meta.url)));

// The build-mode initialization writes runtime artifacts from the checked-in catalogs.
// Extraction is a separate authoring step so installation cannot hide stale catalog changes.
await Hub.create("build", { ...config, ai: null }, root);
