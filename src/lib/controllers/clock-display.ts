import { progressImport, userState } from "#lib/stores/user-state.svelte.js";

/** The date shown by Home and the clock picker once local progress has loaded. */
export function readClockDisplay(): {
  day: number | undefined;
  usesDayOneDefaults: boolean;
  year: number | undefined;
} {
  const { day, saveDate, season, weather, year } = userState.state.worldState;
  const usesDayOneDefaults =
    day === undefined &&
    year === undefined &&
    saveDate === undefined &&
    season === "spring" &&
    weather === "calm" &&
    !progressImport.lastImport &&
    userState.trackingLane === undefined &&
    !userState.hasAnyProgress;

  return {
    day: usesDayOneDefaults ? 1 : day,
    usesDayOneDefaults,
    year: usesDayOneDefaults ? 1 : year,
  };
}
