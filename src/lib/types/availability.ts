export const AVAILABILITY_WINDOWS = ["now", "anytime", "later"] as const;
export const DEFAULT_AVAILABILITY_WINDOWS: AvailabilityWindow[] = ["now", "anytime"];

export type AvailabilitySelection = LegacyAvailabilityMode | readonly AvailabilityWindow[];
export type AvailabilityWindow = (typeof AVAILABILITY_WINDOWS)[number];
export type LegacyAvailabilityMode = "available" | "everything" | "timely";

export function legacyAvailabilityWindows(mode: LegacyAvailabilityMode): AvailabilityWindow[] {
  switch (mode) {
    case "available":
      return [...DEFAULT_AVAILABILITY_WINDOWS];
    case "everything":
      return [...AVAILABILITY_WINDOWS];
    case "timely":
      return ["now"];
  }
}
