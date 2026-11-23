import { trackerData } from "#lib/data/index.js";
import { getName, nameCollator } from "#lib/data/names.js";
import { seasonOrdinal } from "#lib/engine/domain-primitives.js";
import { DAYS_PER_SEASON, SEASONS_PER_YEAR } from "#lib/engine/game-calendar.js";

import type { WorldDay } from "#lib/engine/world-state.js";
import type { LocaleCode } from "#lib/types/locale.js";
import type { Villager, VillagerId } from "#lib/types/tracker-data.js";

export interface VillagerRosterEntry extends Villager {
  id: VillagerId;
  name: string;
}

export function buildVillagerRoster(locale: LocaleCode): VillagerRosterEntry[] {
  const collator = nameCollator(locale);
  return Object.entries(trackerData.villagers)
    .map(([id, villager]) => {
      const villagerId = id as VillagerId;
      return { ...villager, id: villagerId, name: getName("villagers", villagerId, locale) };
    })
    .toSorted((a, b) => collator.compare(a.name, b.name));
}

/** Order dates in the year, or count forward from a known day across the year boundary. */
export function birthdayOffset(
  birthday: Villager["birthday"],
  today: Pick<WorldDay, "day" | "season">,
): number {
  const date = seasonOrdinal(birthday.season) * DAYS_PER_SEASON + birthday.day;
  if (today.day === undefined) return date - 1;
  const now = seasonOrdinal(today.season) * DAYS_PER_SEASON + today.day;
  const year = DAYS_PER_SEASON * SEASONS_PER_YEAR;
  return (date - now + year) % year;
}
