// Exports the data the round-ten mockup draws, from three saves, through the app's own projections.
// It needs the app's Svelte transform, so it runs under Vitest: copy it to src/lib/zz-field-guide-export.test.ts (plain JS is valid there),
// run `R10_OUT=<path>/data.json pnpm exec vitest run --project app src/lib/zz-field-guide-export.test.ts`,
// then delete the copy. See ../README.md.
import { readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";

import { buildSourceChecklist } from "#lib/controllers/source-checklist.js";
import { trackerData as d } from "#lib/data/index.js";
import { isSourceDoable } from "#lib/engine/availability.js";
import { CATEGORIES, getAllProgress } from "#lib/engine/categories.js";
import { extractSave, progressOfExtraction, unpackSavFile } from "#lib/engine/import-save.js";
import { createDefaultProgress } from "#lib/engine/progress-fields.js";
import { readGameDate } from "#lib/engine/sync-freshness.js";
import { deriveProgressionState, isConditionVisible } from "#lib/engine/visibility.js";
import { projectSourceGroups, SOURCE_TYPE_ORDER } from "#lib/presentation/source-groups.js";
import { sourceSectionLabel, sourceTypeLabel } from "#lib/presentation/source-labels.js";
import { buildBaseSegmentLookups } from "#lib/sources/segment-lookups.js";
import { computeSpoileredStoreIds } from "#lib/sources/spoilered-stores.js";

const OUT = process.env.R10_OUT;
const J = (p) => JSON.parse(readFileSync(p, "utf8"));
const L = (f) => {
  try {
    return J("src/lib/data/locales/en/" + f + ".json");
  } catch {
    return {};
  }
};
const T = Object.fromEntries(
  [
    "items",
    "stores",
    "villagers",
    "locations",
    "recipes",
    "quests",
    "festivals",
    "mines",
    "perks",
    "skills",
    "treasure-chest-tiers",
    "museum_wings",
    "town-ranks",
    "spells",
    "animals",
    "cosmetics",
  ].map((f) => [f, L(f)]),
);
const ui = J("messages/en.json");
const human = (id) => id.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const nm = (t, id) => {
  const v = T[t]?.[id];
  return typeof v === "string" ? v : (v?.name ?? human(id));
};
// Every way of making something with a recipe is one family, placed at its station (#632 will name the stations).
const MAKE = {
  craft: "Craft",
  cook: "Cook",
  smith: "Smith",
  mill: "Mill",
  dragon_forge: "Dragon Forge",
};
const FAM = {
  store: "buy",
  treasure_chest: "chest",
  mine: "mines",
  mines_chest: "mines",
  mines_dig_site: "mines",
  mine_fish: "fish",
  museum_donation: "museum",
  artifact_replicator: "replica",
  festival_activity: "festival",
  festival: "festival",
  quest: "quest",
  lost_and_found: "lost",
  wishing_well: "well",
  perk: "perk",
  perk_drop: "perk",
  renown: "renown",
  letter: "letter",
  chicken_statue: "statue",
  horse_statue: "statue",
  monster: "monster",
  monster_feed: "monster",
  forage: "forage",
  crop: "grow",
  tree: "grow",
  fish: "fish",
  bait_fish: "fish",
  fish_trap: "fish",
  dive: "dive",
  bug_catch: "bug",
  artifact_dig: "dig",
  station: "make",
  recipe: "make",
  animal_product: "animal",
  spouseGift: "spouse",
  proposal: "spouse",
  wedding: "spouse",
  engagement: "spouse",
  date: "date",
  date_inspiration: "date",
  date_inspiration_drop: "date",
  cutscene: "story",
  reach_day: "story",
  upgrade: "buy",
  secret_chest: "chest",
  ship_item: "story",
  donate_item: "museum",
  scroll_bundle: "bundle",
  breed: "animal",
  default: "story",
  ritual_chamber: "perk",
};
const detail = (s) => {
  if (s.type === "recipe") return MAKE[s.method] ?? "Made";
  if (s.type === "station") return human(s.stationId);
  if (s.type === "scroll_bundle") return s.bundleItemId ? nm("items", s.bundleItemId) : "";
  if (s.storeId) return nm("stores", s.storeId);
  if (s.tier) return nm("treasure-chest-tiers", s.tier);
  if (s.biomeId) return nm("mines", s.biomeId);
  if (s.wingId) return nm("museum_wings", s.wingId) + (s.setCount ? `, ${s.setCount} sets` : "");
  if (s.originalItemId) return "from " + nm("items", s.originalItemId);
  if (s.festivalId) return nm("festivals", s.festivalId);
  if (s.questId) return nm("quests", s.questId);
  if (s.perkId) return nm("perks", s.perkId);
  if (s.type === "renown") return "Level " + s.level;
  if (s.type === "wishing_well") return (s.cost ?? 0).toLocaleString("en-US") + " essence";
  if (s.type === "chicken_statue" || s.type === "horse_statue")
    return s.cost ? s.cost + (s.type === "chicken_statue" ? " beads" : " essence") : "";
  if (s.villagerId) return nm("villagers", s.villagerId);
  if (s.seedItemId) return nm("items", s.seedItemId) + (s.greenhouse ? ", greenhouse" : "");
  if (s.saplingItemId) return nm("items", s.saplingItemId);
  if (s.waterTypes) return s.waterTypes.map(human).join(", ");
  if (s.locationIds) return s.locationIds.map((l) => nm("locations", l)).join(", ");
  if (s.monsterId) return human(s.monsterId);
  if (s.animalId) return human(s.animalId);
  if (s.type === "letter") return s.trigger === "birthday" ? "on your birthday" : "";
  return "";
};
const walk = (c, out) => {
  if (!c) return;
  if (c.type === "all") return c.conditions.forEach((x) => walk(x, out));
  if (c.type === "any") {
    const sub = { g: [] };
    c.conditions.forEach((x) => walk(x, sub));
    if (sub.s) out.s = sub.s;
    if (sub.g.length) out.g.push(sub.g.join(" or "));
    return;
  }
  switch (c.type) {
    case "season":
      out.s = c.seasons;
      break;
    case "time":
      out.t = [c.start, c.end];
      break;
    case "weather":
      out.w = c.weathers;
      break;
    case "heartLevel":
      out.g.push(c.level + " hearts with " + nm("villagers", c.villagerId));
      break;
    case "gamePredicate":
      if (c.predicate === "is_player_birthday") out.g.push("on your birthday");
      break;
    case "mineFloor":
      out.g.push("mines floor " + c.floor);
      break;
    case "quest":
      out.g.push("after " + nm("quests", c.questId));
      break;
    case "skillLevel":
      out.g.push(nm("skills", c.skillId) + " " + c.level);
      break;
    case "reachedSeason":
      out.g.push("from your first " + c.season);
      break;
    case "perkUnlocked":
      out.g.push("with " + nm("perks", c.perkId));
      break;
  }
};
const SAVES = [
  ["late", "pipeline/input/v1.0.8/save/game-1315159680-autosave.sav"],
  ["mid", "pipeline/input/archive/Save file/game-1315159680-autosave.sav"],
  ["new", "pipeline/input/v1.0.8/save/game-1720221376-autosave.sav"],
];
const K = SAVES.map(([k]) => k);

it("exports the field guide mockup's data", async () => {
  const ctxs = {},
    saves = {},
    prog = {};
  for (const [k, f] of SAVES) {
    const bundle = await unpackSavFile(new File([readFileSync(f)], "x.sav"));
    const { completed, day, playtime } = progressOfExtraction(extractSave(bundle));
    const progress = { ...createDefaultProgress(), ...completed };
    ctxs[k] = {
      progress,
      progressionState: deriveProgressionState(progress, d, false),
      worldState: day,
    };
    saves[k] = {
      name: bundle.header?.name,
      farm: bundle.header?.farm_name,
      date: readGameDate(bundle),
      weather: day.weather,
      playtime: Math.round((playtime ?? 0) / 3600),
      floor: progress.mineFloor,
      renown: progress.renown,
      hearts: progress.heartLevels,
      rel: progress.villagerRelationships,
      skills: progress.skillLevels,
      perks: [...(progress.unlockedPerks ?? [])],
    };
    prog[k] = Object.fromEntries(
      Object.entries(getAllProgress(ctxs[k])).map(([c, t]) => [c, [t.completed, t.total]]),
    );
  }
  const PS = (k) => ctxs[k].progressionState;
  const vis = (c, k) => isConditionVisible(c, PS(k));
  const hidden = (s, k) =>
    (s.storeId && d.stores[s.storeId]?.visibility && !vis(d.stores[s.storeId].visibility, k)) ||
    (s.visibility && !vis(s.visibility, k))
      ? 1
      : 0;
  const museumRows = Object.fromEntries(K.map((k) => [k, CATEGORIES.museum.project(ctxs[k]).rows]));
  const setsDone = (k, wing) => {
    const by = new Map();
    for (const r of museumRows[k])
      if (r.wingId === wing) by.set(r.setId, (by.get(r.setId) ?? true) && r.completed);
    return [...by.values()].filter(Boolean).length;
  };
  // #620's gates over the app's availability: mine floors (a floor-1 save hasn't entered), the replicator's
  // original, festival days, renown levels, & museum set counts.
  const gate620 = (s, k) => {
    const sv = saves[k],
      p = ctxs[k].progress;
    if (s.biomeId) {
      const b = d.mines.biomes.find((x) => x.id === s.biomeId);
      return !!b && sv.floor >= Math.max(2, b.floors.start);
    }
    if (
      ["mine", "mines_chest", "mines_dig_site", "mine_fish", "monster", "monster_feed"].includes(
        s.type,
      )
    )
      return sv.floor >= 2;
    if (s.type === "artifact_replicator") return p.almanac.has(s.originalItemId);
    if (s.festivalId && d.festivals[s.festivalId]) {
      const fd = d.festivals[s.festivalId].date;
      return fd.season === sv.date.season && fd.day === sv.date.day;
    }
    if (s.type === "renown") return sv.renown >= s.level;
    if (s.type === "museum_donation") return setsDone(k, s.wingId) >= (s.setCount ?? 1);
    return true;
  };
  const SRC = [],
    srcIx = new Map();
  const enc = (s) => {
    const o = { f: FAM[s.type] ?? "story", d: detail(s), g: [] };
    walk(s.availability, o);
    if (s.festivalId && d.festivals[s.festivalId]) {
      const fd = d.festivals[s.festivalId].date;
      if (!o.s) o.s = [fd.season];
      o.fd = [fd.season, fd.day];
    }
    if (s.type === "renown") o.lv = s.level;
    if (!o.g.length) delete o.g;
    else o.g = o.g.join(", ");
    let h = K.map((k) => hidden(s, k));
    if (s.type === "recipe") {
      const rs = d.recipes[s.recipeId]?.sources ?? [];
      const learn = rs.map((x) => {
        const t = detail(x),
          lh = K.map((k) => hidden(x, k));
        const special = {
          ship_item: x.triggerItemId ? "after shipping " + nm("items", x.triggerItemId) : "",
          donate_item: x.triggerItemId ? "after donating " + nm("items", x.triggerItemId) : "",
          engagement: "after your engagement",
          wedding: "after your wedding",
          secret_chest: x.locationId ? "gold chest in " + nm("locations", x.locationId) : "",
          letter: "in a letter",
          reach_day: x.triggerDate
            ? "letter, " + human(x.triggerDate.season) + " " + x.triggerDate.day
            : "",
          renown: "renown " + x.level,
        };
        if (special[x.type]) return { t: special[x.type], h: lh };
        return {
          t:
            x.type === "default"
              ? "a starting recipe"
              : x.type === "store"
                ? "from " + t
                : x.type === "perk" || x.type === "ritual_chamber"
                  ? t + " perk"
                  : t
                    ? "from " + t
                    : (FAM[x.type] ?? x.type),
          h: lh,
        };
      });
      const shown = (i) => learn.filter((l) => !l.h[i]);
      if (learn.length) {
        o.rl = K.map((_, i) => shown(i)[0]?.t ?? "");
        o.rn = K.map((_, i) => shown(i).length);
        h = h.map((x, i) => (x || !shown(i).length ? 1 : 0));
      }
    }
    if (h.some(Boolean)) o.h = h;
    const key = JSON.stringify(o);
    if (!srcIx.has(key)) {
      srcIx.set(key, SRC.length);
      SRC.push(o);
    }
    return srcIx.get(key);
  };
  const lists = Object.fromEntries(K.map((k) => [k, buildSourceChecklist(ctxs[k], "en", false)]));
  const base = lists.late,
    byKey = Object.fromEntries(K.map((k) => [k, new Map(lists[k].map((e) => [e.key, e]))]));
  const almGroup = new Map();
  for (const [g, v] of Object.entries(d.almanac))
    for (const r of v.items) almGroup.set(r.itemIds[0], g);
  const musOf = new Map(museumRows.late.map((r) => [r.id, r]));
  const questType = new Map();
  for (const [t, qs] of Object.entries(d.quests))
    for (const id of Object.keys(qs)) questType.set(id, t);
  // [section, subsection] on each category page.
  const place = (e) => {
    switch (e.reportCategory) {
      case "almanac-item":
        return [almGroup.get(e.id) ?? "other", ""];
      case "museum-item": {
        const r = musOf.get(e.id);
        return [r?.wingId ?? "other", r ? nm("museum_wings", `${r.wingId}/sets/${r.setId}`) : ""];
      }
      case "recipe": {
        const s = e.sources.find((x) => x.type !== "default") ?? e.sources[0];
        return [s?.type ?? "other", ""];
      }
      case "cosmetic":
        return [e.slot ?? "other", ""];
      case "quest":
        return [questType.get(e.id) ?? "other", ""];
      case "animal-variants":
        return [e.id.split("/")[0], "Colors"];
      case "animal-cosmetics":
        return [e.id.split("/")[0], "Cosmetics"];
      case "pet-skin":
        return ["pets", "Skins"];
      case "pet-cosmetic":
        return ["pets", "Cosmetics"];
      case "mount-appearance":
        return ["mount", "Appearances"];
      case "mount-perk":
        return ["mount", "Perks"];
      case "spell":
        return ["spells", ""];
      default:
        return ["other", ""];
    }
  };
  const ve = (e, k) => !vis(e.visibility, k);
  const doable = (e, k, sources) => {
    if (e.locked || ve(e, k)) return 0;
    if (!sources.length) return 1;
    return sources.some((s) => gate620(s, k) && isSourceDoable(s, ctxs[k])) ? 1 : 0;
  };
  // Quest rewards: the entries that list a quest as a source.
  const rewards = new Map();
  base.forEach((e) =>
    e.sources.forEach((s) => {
      if (s.type === "quest") {
        const l = rewards.get(s.questId) ?? [];
        if (!l.includes(e.name)) l.push(e.name);
        rewards.set(s.questId, l);
      }
    }),
  );
  const E = base.map((e) => {
    const [g, sub] = place(e);
    return [
      e.category,
      e.reportCategory,
      e.name,
      e.subtitle ?? "",
      e.sprite ?? "",
      e.sources.map(enc),
      g,
      e.id,
      sub,
      e.reportCategory === "quest" ? (rewards.get(e.id) ?? []).slice(0, 4).join(", ") : "",
    ];
  });
  const st = {};
  for (const k of K) {
    const list = base.map((e) => byKey[k].get(e.key) ?? e);
    st[k] = {
      done: list.map((e) => (e.completed ? 1 : 0)).join(""),
      sp: list.map((e) => (ve(e, k) || e.locked ? 1 : 0)).join(""),
      dy: list.map((e) => doable(e, k, e.sources)).join(""),
      qs: list.map((e) => e.questState ?? ""),
    };
  }
  // Whole sections that are spoilered: quest types behind a villager or renown, animals not unlocked yet.
  const gsp = {};
  for (const k of K) {
    const o = {};
    for (const [t, c] of Object.entries(d.categoryVisibility)) o["quests:" + t] = vis(c, k) ? 0 : 1;
    for (const [a, v] of Object.entries(d.animals))
      o["animals:" + a] = vis(v.visibility, k) ? 0 : 1;
    gsp[k] = o;
  }
  const keyIx = new Map(base.map((e, i) => [e.key, i]));
  const SECS = {};
  for (const k of K) {
    const secs = projectSourceGroups(lists[k], ctxs[k]);
    const lookups = buildBaseSegmentLookups(computeSpoileredStoreIds(PS(k)), "en");
    const merged = new Map();
    for (const s of secs) {
      let label = sourceSectionLabel(s, lookups, PS(k)).name,
        id = s.id;
      const src = s.source;
      if (s.group === "crafting" && src?.type === "recipe") {
        id = "make-" + src.method;
        label = MAKE[src.method] ?? label;
      } else if (src?.type === "station") {
        id = "make-" + src.stationId;
        label = human(src.stationId);
      } else if (s.group === "farming" && src) {
        id = "farm-" + src.type + (src.greenhouse ? "-gh" : "");
        label =
          src.type === "crop"
            ? src.greenhouse
              ? "Grow in the greenhouse"
              : "Grow from seed"
            : src.type === "tree"
              ? "Grow from a sapling"
              : label;
      } else if (s.group === "museum" && src?.wingId) {
        id = "museum-" + src.wingId;
        label = "Rewards in " + nm("museum_wings", src.wingId);
      } else id = s.group + ":" + label;
      const g = src?.type === "station" ? "crafting" : s.group;
      const m = merged.get(id) ?? { g, label, sp: s.spoilered ? 1 : 0, rows: new Map() };
      if (!s.spoilered) m.sp = 0;
      for (const r of s.rows) {
        const i = keyIx.get(r.entry.key);
        if (i === undefined) continue;
        m.rows.set(i, Math.max(m.rows.get(i) ?? 0, doable(r.entry, k, r.sources)));
      }
      merged.set(id, m);
    }
    SECS[k] = [...merged.values()].map((m) => [m.g, m.label, m.sp, [...m.rows.entries()]]);
  }
  const GL = Object.fromEntries(SOURCE_TYPE_ORDER.map((g) => [g, sourceTypeLabel(g, "en")]));
  const strip = (x) =>
    JSON.parse(
      JSON.stringify(x, (_k, v) =>
        v instanceof Set ? [...v] : typeof v === "function" ? undefined : v,
      ),
    );
  const pages = Object.fromEntries(
    K.map((k) => [
      k,
      strip(
        Object.fromEntries(
          ["villagers", "skills", "mines", "renown"].map((c) => [
            c,
            CATEGORIES[c].project(ctxs[k]),
          ]),
        ),
      ),
    ]),
  );
  writeFileSync(
    OUT,
    JSON.stringify({
      saves,
      prog,
      E,
      SRC,
      st,
      gsp,
      SECS,
      GL,
      pages,
      vill: Object.entries(d.villagers).map(([id, v]) => ({
        id,
        n: nm("villagers", id),
        b: [v.birthday.season, v.birthday.day],
        dt: v.dateable ? 1 : 0,
      })),
      skills: Object.fromEntries(
        Object.entries(d.skills).map(([id, s]) => [
          id,
          {
            n: nm("skills", id),
            tiers: s.perkTiers.map((t) => Object.keys(t).map((p) => [p, nm("perks", p)])),
          },
        ]),
      ),
      tierLevels: d.perkTierLevels,
      ranks: strip(d.townRanks).map((r, i) => ({
        ...r,
        n: T["town-ranks"]?.[i] ?? String(i),
      })),
      biomes: d.mines.biomes.map((b) => ({ ...b, n: nm("mines", b.id) })),
      seals: d.mines.seals,
      spells: Object.fromEntries(Object.keys(d.mines.spells).map((id) => [id, nm("spells", id)])),
      wings: Object.fromEntries(Object.keys(d.museum).map((w) => [w, nm("museum_wings", w)])),
      animals: Object.fromEntries(
        Object.keys(d.animals).map((a) => [
          a,
          nm("animals", a + "/core") === human(a + "/core") ? human(a) : nm("animals", a + "/core"),
        ]),
      ),
      weather: Object.fromEntries(Object.entries(ui).filter(([key]) => key.startsWith("weather_"))),
    }),
  );
}, 300_000);
