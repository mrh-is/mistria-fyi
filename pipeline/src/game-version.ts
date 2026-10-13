/**
 * The game version the canonical assets (`pipeline/input/assets`) hold. `pipeline:assets` stamps it
 * on the tracker data (`--version=current`), the real-asset suite expects it, and the canonical
 * parse profile checks against it. A game update bumps it here and nowhere else (see
 * `docs/game-version-update-protocol.md`).
 */
export const CURRENT_GAME_VERSION = "1.0.7";
