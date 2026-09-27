export const AVAILABILITY_WINDOWS = ["now", "anytime", "later"] as const;
export const DEFAULT_AVAILABILITY_WINDOWS: AvailabilityWindow[] = ["now", "anytime"];
export const LEGACY_AVAILABILITY_MODES = ["available", "everything", "timely"] as const;

export type AvailabilitySelection = LegacyAvailabilityMode | readonly AvailabilityWindow[];
export type AvailabilityWindow = (typeof AVAILABILITY_WINDOWS)[number];
export type LegacyAvailabilityMode = (typeof LEGACY_AVAILABILITY_MODES)[number];

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
