/**
 * The game version the tracker data is built from. `pipeline:assets` regenerates from its
 * `pipeline/input/vX.Y.Z/assets` folder (`--version=current`), and the canonical parse profile
 * checks against it. A game update bumps it here and nowhere else (see
 * `docs/game-version-update-protocol.md`).
 */
export const CURRENT_GAME_VERSION = "1.0.7";
