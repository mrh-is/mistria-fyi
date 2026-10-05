// Compiles `src/lib/paraglide` outside Vite (run by `prepare`) with the same options the Vite
// plugin uses. The Paraglide CLI exposes only a few options as flags, so calling it directly would
// emit a runtime with the default strategy & URL patterns until the next Vite run replaced it.
import { compile } from "@inlang/paraglide-js";

import { PARAGLIDE_OPTIONS } from "../src/lib/i18n/paraglide-options.js";

await compile(PARAGLIDE_OPTIONS);
