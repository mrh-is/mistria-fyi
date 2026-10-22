import { recordKeys, recordValues } from "#lib/utils/record.js";

import type { PerkId, TrackerData } from "#lib/types/tracker-data.js";

/**
 * Every skill tier's perks. Acquisition sources & visibility references that name a perk (`perk`,
 * `perk_drop`, `perkUnlocked`, …) resolve it to its skill, so they accept only these.
 */
export function skillPerkIds(data: Pick<TrackerData, "skills">): PerkId[] {
  return recordValues(data.skills).flatMap((skill) =>
    skill.perkTiers.flatMap((tier) => recordKeys(tier)),
  );
}

/**
 * Every perk the tracker records in `unlockedPerks`: each skill's perk tiers, then the Mistmare's
 * perks. The game keeps both in one `player.perks` list, so they share one progress set.
 */
export function trackedPerkIds(data: Pick<TrackerData, "mount" | "skills">): PerkId[] {
  return [...skillPerkIds(data), ...recordKeys(data.mount.perks)];
}
