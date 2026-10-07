export const AVAILABILITY_WINDOWS = ["now", "anytime", "later"] as const;
export const DEFAULT_AVAILABILITY_WINDOWS: AvailabilityWindow[] = ["now", "anytime"];

export type AvailabilityWindow = (typeof AVAILABILITY_WINDOWS)[number];
