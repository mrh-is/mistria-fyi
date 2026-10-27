/**
 * The row windows, as stored in display preferences. "anytime" reads “Whenever” in the UI; the
 * stored value keeps its original name so saved filter choices need no migration.
 */
export const AVAILABILITY_WINDOWS = ["now", "anytime", "later"] as const;
export const DEFAULT_AVAILABILITY_WINDOWS: AvailabilityWindow[] = ["now", "anytime"];

export type AvailabilityWindow = (typeof AVAILABILITY_WINDOWS)[number];
