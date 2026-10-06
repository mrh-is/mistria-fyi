import { trackerData } from "#lib/data/index.js";
import { getName, nameCollator } from "#lib/data/names.js";

import { isVillagerComplete } from "./progress.js";

import type { LocaleCode } from "#lib/types/locale.js";
import type { Villager, VillagerId } from "#lib/types/tracker-data.js";
import type { ProgressState } from "#lib/types/user-progress.js";
import type { DeepReadonly } from "#lib/utils/deep-readonly.js";

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

export function filterVillagerRoster(
  roster: VillagerRosterEntry[],
  completed: DeepReadonly<ProgressState>,
  showCompleted: boolean,
  targetedId: string,
): VillagerRosterEntry[] {
  return roster.filter(
    (villager) =>
      showCompleted || villager.id === targetedId || !isVillagerComplete(villager.id, completed),
  );
}
