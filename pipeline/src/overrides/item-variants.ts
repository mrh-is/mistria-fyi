import type { ItemVariant } from "#lib/types/tracker-data.js";

/**
 * A reviewed set of almanac rows that share an English name within one category, such as the six
 * “Animated Clouds Window” rows. The game names none of its colorways, so each row’s name is the
 * phrase its description doesn’t share with the others (“A large arched oak window …” → “Oak”).
 * The procedure for reviewing these is in `docs/game-version-update-protocol.md`.
 */
export type ItemVariantSet = NamedItemVariantSet | UnnamedItemVariantSet;

export interface NamedItemVariantSet {
  /** The rows’ shared English name, for readers; the extractor checks it. */
  name: string;
  /**
   * Each row’s canonical item ID, with its variant & the English description it came from. The
   * extractor throws when a description changes, so a reworded game update gets reviewed again.
   */
  named: Readonly<Record<string, { description: string; variant: ItemVariant }>>;
}

/** Rows left unnamed because none of them has a differentiator, such as bare `_v1` & `_v2` IDs. */
export interface UnnamedItemVariantSet {
  name: string;
  reason: string;
  /**
   * Each row’s canonical item ID & English description. The extractor throws when one changes,
   * since a reworded update may give the set a differentiator.
   */
  unnamed: Readonly<Record<string, string>>;
}

/** Every same-named row set in v1.0.8, sorted by name. */
export const ITEM_VARIANT_SETS: readonly ItemVariantSet[] = [
  {
    name: "Accessory Plant",
    reason: "Identical descriptions, and the IDs differ only by version number.",
    unnamed: {
      bonsai_accessory_plant_v1: "A small plant to accompany a bonsai.",
      bonsai_accessory_plant_v2: "A small plant to accompany a bonsai.",
      bonsai_accessory_plant_v3: "A small plant to accompany a bonsai.",
    },
  },
  {
    name: "Anchor",
    named: {
      pirate_anchor_v1: { description: "An cool-toned old anchor.", variant: "cool_toned" },
      pirate_anchor_v2: { description: "An warm-toned old anchor.", variant: "warm_toned" },
    },
  },
  {
    name: "Animated Clouds Window",
    named: {
      animated_cloud_window_v1_black: {
        description:
          "A large arched black colored window with a view of clouds floating by at sunset. Interact when placed to toggle its animation!",
        variant: "black",
      },
      animated_cloud_window_v1_cream: {
        description:
          "A large arched cream colored window with a view of clouds floating by. Interact when placed to toggle its animation!",
        variant: "cream",
      },
      animated_cloud_window_v1_gold: {
        description:
          "A large arched gold colored window with a view of clouds floating by. Interact when placed to toggle its animation!",
        variant: "gold",
      },
      animated_cloud_window_v1_oak: {
        description:
          "A large arched oak window with a view of clouds floating by. Interact when placed to toggle its animation!",
        variant: "oak",
      },
      animated_cloud_window_v1_walnut: {
        description:
          "A large arched walnut window with a view of clouds floating by. Interact when placed to toggle its animation!",
        variant: "walnut",
      },
      animated_cloud_window_v1_white: {
        description:
          "A large arched white colored window with a view of clouds floating by. Interact when placed to toggle its animation!",
        variant: "white",
      },
    },
  },
  {
    name: "Animated Clouds Window Seat",
    named: {
      animated_cloud_window_v2_black: {
        description:
          "A large arched black colored window with a view of clouds floating by at sunset. Interact when placed to toggle its animation!",
        variant: "black",
      },
      animated_cloud_window_v2_cream: {
        description:
          "A large arched cream colored window with a view of clouds floating by. Interact when placed to toggle its animation!",
        variant: "cream",
      },
      animated_cloud_window_v2_gold: {
        description:
          "A large arched gold colored window with a view of clouds floating by. Interact when placed to toggle its animation!",
        variant: "gold",
      },
      animated_cloud_window_v2_oak: {
        description:
          "A large arched oak window with a view of clouds floating by. Interact when placed to toggle its animation!",
        variant: "oak",
      },
      animated_cloud_window_v2_walnut: {
        description:
          "A large arched walnut window with a view of clouds floating by. Interact when placed to toggle its animation!",
        variant: "walnut",
      },
      animated_cloud_window_v2_white: {
        description:
          "A large arched white colored window with a view of clouds floating by. Interact when placed to toggle its animation!",
        variant: "white",
      },
    },
  },
  {
    name: "Basic Counter",
    named: {
      counter_basic_v1: {
        description: "An oak basic counter piece. Place two or more together to connect them!",
        variant: "oak",
      },
      counter_basic_v2: {
        description: "A walnut basic counter piece. Place two or more together to connect them!",
        variant: "walnut",
      },
    },
  },
  {
    name: "Broken Bottle",
    reason: "Identical descriptions, and the IDs differ only by version number.",
    unnamed: {
      dingy_broken_bottle_v1: "A broken bottle.",
      dingy_broken_bottle_v2: "A broken bottle.",
    },
  },
  {
    name: "Broken Plate",
    reason: "Identical descriptions, and the IDs differ only by version number.",
    unnamed: { dingy_broken_plate_v1: "A broken plate.", dingy_broken_plate_v2: "A broken plate." },
  },
  {
    name: "Broken Springs Couch",
    reason: "Identical descriptions, and the IDs differ only by version number.",
    unnamed: {
      dingy_couch_v1: "An uncomfortable couch that's beyond repair.",
      dingy_couch_v2: "An uncomfortable couch that's beyond repair.",
    },
  },
  {
    name: "Broken Window",
    reason: "Identical descriptions, and the IDs differ only by version number.",
    unnamed: {
      dingy_window_v1: "Many of the panes of this window are broken.",
      dingy_window_v2: "Many of the panes of this window are broken.",
    },
  },
  {
    name: "Cabin Counter",
    named: {
      counter_cabin_cherry: {
        description: "A cherry cabin counter piece. Place two or more together to connect them!",
        variant: "cherry",
      },
      counter_cabin_oak: {
        description: "An oak cabin counter piece. Place two or more together to connect them!",
        variant: "oak",
      },
      counter_cabin_walnut: {
        description: "A walnut cabin counter piece. Place two or more together to connect them!",
        variant: "walnut",
      },
    },
  },
  {
    name: "Cake Counter",
    named: {
      counter_cake_chocolate: {
        description: "A mocha cake counter piece. Place two or more together to connect them!",
        variant: "mocha",
      },
      counter_cake_double_chocolate: {
        description: "A chocolate cake counter piece. Place two or more together to connect them!",
        variant: "chocolate",
      },
      counter_cake_strawberry: {
        description: "A strawberry cake counter piece. Place two or more together to connect them!",
        variant: "strawberry",
      },
    },
  },
  {
    name: "Cardboard Box Chair",
    reason: "Identical descriptions, and the IDs differ only by version number.",
    unnamed: {
      dingy_chair_v1: "An improvised chair made from a cardboard box.",
      dingy_chair_v2: "An improvised chair made from a cardboard box.",
    },
  },
  {
    name: "Chipped Cup",
    reason: "Identical descriptions, and the IDs differ only by version number.",
    unnamed: { dingy_chipped_cup_v1: "A chipped cup.", dingy_chipped_cup_v2: "A chipped cup." },
  },
  {
    name: "Counterfeit Gold Pile",
    named: {
      pirate_counterfeit_gold_pile_v1: {
        description: "These gold colored coins are clearly fake, but still shine alluringly.",
        variant: "gold",
      },
      pirate_counterfeit_gold_pile_v2: {
        description: "These pink-tinged coins are clearly fake, but still shine alluringly.",
        variant: "pink_tinged",
      },
    },
  },
  {
    name: "Deluxe Icebox",
    named: {
      deluxe_icebox_blue: {
        description: "A blue deluxe icebox with an extra-large storage capacity.",
        variant: "blue",
      },
      deluxe_icebox_green: {
        description: "A green deluxe icebox with an extra-large storage capacity.",
        variant: "green",
      },
      deluxe_icebox_pink: {
        description: "A pink deluxe icebox with an extra-large storage capacity.",
        variant: "pink",
      },
      deluxe_icebox_white: {
        description: "A white deluxe icebox with an extra-large storage capacity.",
        variant: "white",
      },
      deluxe_icebox_yellow: {
        description: "A yellow deluxe icebox with an extra-large storage capacity.",
        variant: "yellow",
      },
    },
  },
  {
    name: "Deluxe Storage Chest",
    named: {
      deluxe_storage_chest_aqua: {
        description: "An aqua deluxe storage chest with an extra-large storage capacity.",
        variant: "aqua",
      },
      deluxe_storage_chest_black: {
        description: "A black deluxe storage chest with an extra-large storage capacity.",
        variant: "black",
      },
      deluxe_storage_chest_blue: {
        description: "A blue deluxe storage chest with an extra-large storage capacity.",
        variant: "blue",
      },
      deluxe_storage_chest_dark_brown: {
        description: "A dark brown deluxe storage chest with an extra-large storage capacity.",
        variant: "dark_brown",
      },
      deluxe_storage_chest_gold: {
        description: "A gold deluxe storage chest with an extra-large storage capacity.",
        variant: "gold",
      },
      deluxe_storage_chest_gray: {
        description: "A gray deluxe storage chest with an extra-large storage capacity.",
        variant: "gray",
      },
      deluxe_storage_chest_green: {
        description: "A green deluxe storage chest with an extra-large storage capacity.",
        variant: "green",
      },
      deluxe_storage_chest_light_brown: {
        description: "A light brown deluxe storage chest with an extra-large storage capacity.",
        variant: "light_brown",
      },
      deluxe_storage_chest_orange: {
        description: "An orange deluxe storage chest with an extra-large storage capacity.",
        variant: "orange",
      },
      deluxe_storage_chest_pink: {
        description: "A pink deluxe storage chest with an extra-large storage capacity.",
        variant: "pink",
      },
      deluxe_storage_chest_purple: {
        description: "A purple deluxe storage chest with an extra-large storage capacity.",
        variant: "purple",
      },
      deluxe_storage_chest_red: {
        description: "A red deluxe storage chest with an extra-large storage capacity.",
        variant: "red",
      },
      deluxe_storage_chest_white: {
        description: "A white deluxe storage chest with an extra-large storage capacity.",
        variant: "white",
      },
    },
  },
  {
    name: "Dirty Tiles Flooring",
    reason: "Identical descriptions, and the IDs differ only by version number.",
    unnamed: {
      dingy_flooring_v1: "This tiled floor has seen better days.",
      dingy_flooring_v2: "This tiled floor has seen better days.",
    },
  },
  {
    name: "Dragon Ruins Pillar",
    named: {
      dragon_ruins_pillar_v1: {
        description: "A purple pillar with a dragon scale motif.",
        variant: "plain",
      },
      dragon_ruins_pillar_v2: {
        description: "A purple pillar with a dragon scale motif and gold accents.",
        variant: "gold_accents",
      },
    },
  },
  {
    name: "Dragon Stained Glass Window",
    named: {
      dragon_stained_glass_window_v1: {
        description: "A pink stained glass window with dragon figures.",
        variant: "pink",
      },
      dragon_stained_glass_window_v2: {
        description: "A purple stained glass window with dragon figures.",
        variant: "purple",
      },
    },
  },
  {
    name: '"Elegant Rose" Painting',
    named: {
      painting_rose_v1: {
        description: "A painting of a rose in a dark wood frame.",
        variant: "dark_wood",
      },
      painting_rose_v2: {
        description: "A painting of a rose in a walnut frame.",
        variant: "walnut",
      },
    },
  },
  {
    name: "Extra Large Decorative Pumpkin",
    named: {
      extra_large_decorative_pumpkin_black: {
        description: "An extra large black decorative pumpkin.",
        variant: "black",
      },
      extra_large_decorative_pumpkin_green: {
        description: "An extra large green decorative pumpkin.",
        variant: "green",
      },
      extra_large_decorative_pumpkin_orange: {
        description: "An extra large orange decorative pumpkin.",
        variant: "orange",
      },
      extra_large_decorative_pumpkin_purple: {
        description: "An extra large purple decorative pumpkin.",
        variant: "purple",
      },
      extra_large_decorative_pumpkin_white: {
        description: "An extra large white decorative pumpkin.",
        variant: "white",
      },
      extra_large_decorative_pumpkin_yellow: {
        description: "An extra large yellow decorative pumpkin.",
        variant: "yellow",
      },
    },
  },
  {
    name: "Garbage Bag",
    reason: "Identical descriptions, and the IDs differ only by version number.",
    unnamed: {
      dingy_garbage_bag_v1: "A full bag of garbage.",
      dingy_garbage_bag_v2: "A full bag of garbage.",
    },
  },
  {
    name: "Incense Burner",
    named: {
      incense_burner_blue: {
        description: "A delicate blue ceramic incense burner.",
        variant: "blue",
      },
      incense_burner_green: {
        description: "A delicate green ceramic incense burner.",
        variant: "green",
      },
      incense_burner_purple: {
        description: "A delicate purple ceramic incense burner.",
        variant: "purple",
      },
      incense_burner_white: {
        description: "A delicate white ceramic incense burner.",
        variant: "white",
      },
    },
  },
  {
    name: "Incense Stick",
    named: {
      incense_stick_v1: { description: "A stick of purple incense.", variant: "purple" },
      incense_stick_v2: { description: "A stick of blue incense.", variant: "blue" },
      incense_stick_v3: { description: "A stick of orange incense.", variant: "orange" },
    },
  },
  {
    name: "Large Decorative Pumpkin",
    named: {
      large_decorative_pumpkin_black: {
        description: "A large black decorative pumpkin.",
        variant: "black",
      },
      large_decorative_pumpkin_green: {
        description: "A large green decorative pumpkin.",
        variant: "green",
      },
      large_decorative_pumpkin_orange: {
        description: "A large orange decorative pumpkin.",
        variant: "orange",
      },
      large_decorative_pumpkin_purple: {
        description: "A large purple decorative pumpkin.",
        variant: "purple",
      },
      large_decorative_pumpkin_white: {
        description: "A large white decorative pumpkin.",
        variant: "white",
      },
      large_decorative_pumpkin_yellow: {
        description: "A large yellow decorative pumpkin.",
        variant: "yellow",
      },
    },
  },
  {
    name: "Large Dragon Rug",
    named: {
      large_dragon_rug: {
        description: "A large purple rug with dragon figures.",
        variant: "purple",
      },
      medium_dragon_rug: { description: "A medium pink rug with dragon figures.", variant: "pink" },
    },
  },
  {
    name: "Lovely Cottage Counter",
    named: {
      counter_cottage_v1: {
        description:
          "A sage lovely cottage counter piece. Place two or more together to connect them!",
        variant: "sage",
      },
      counter_cottage_v2: {
        description:
          "A pink lovely cottage counter piece. Place two or more together to connect them!",
        variant: "pink",
      },
    },
  },
  {
    name: "Medium Decorative Pumpkin",
    named: {
      medium_decorative_pumpkin_black: {
        description: "A medium black decorative pumpkin.",
        variant: "black",
      },
      medium_decorative_pumpkin_green: {
        description: "A medium green decorative pumpkin.",
        variant: "green",
      },
      medium_decorative_pumpkin_orange: {
        description: "A medium orange decorative pumpkin.",
        variant: "orange",
      },
      medium_decorative_pumpkin_purple: {
        description: "A medium purple decorative pumpkin.",
        variant: "purple",
      },
      medium_decorative_pumpkin_white: {
        description: "A medium white decorative pumpkin.",
        variant: "white",
      },
      medium_decorative_pumpkin_yellow: {
        description: "A medium yellow decorative pumpkin.",
        variant: "yellow",
      },
    },
  },
  {
    name: "Mini Tea Set",
    named: {
      mini_tea_set_cup_oak: {
        description: "A decorative tea set with an oak tray and a green lidded cup.",
        variant: "oak_and_green",
      },
      mini_tea_set_cup_walnut: {
        description: "A decorative tea set with a walnut tray and a white lidded cup.",
        variant: "walnut_and_white",
      },
      mini_tea_set_cup_white: {
        description: "A decorative tea set with a white tray and a blue and white lidded cup.",
        variant: "white_and_blue",
      },
      mini_tea_set_teapot_oak: {
        description: "A decorative tea set with an oak tray and a brown clay teapot.",
        variant: "oak_and_brown",
      },
      mini_tea_set_teapot_walnut: {
        description: "A decorative tea set with a walnut tray and an orange clay teapot.",
        variant: "walnut_and_orange",
      },
      mini_tea_set_teapot_white: {
        description: "A decorative tea set with a white tray and a tan clay teapot.",
        variant: "white_and_tan",
      },
    },
  },
  {
    name: "Mist Bed",
    named: {
      mist_bed_v1: {
        description: "A cloudlike bed with sparkly print sheets, perfect for daydreaming on.",
        variant: "sparkly",
      },
      mist_bed_v2: {
        description: "A cloudlike bed with moon print sheets, perfect for daydreaming on.",
        variant: "moon",
      },
      mist_bed_v3: {
        description: "A cloudlike bed with raindrop print sheets, perfect for daydreaming on.",
        variant: "raindrop",
      },
      mist_bed_v4: {
        description: "A cloudlike bed with lightning print sheets, perfect for daydreaming on.",
        variant: "lightning",
      },
    },
  },
  {
    name: "Mist Cushion",
    named: {
      mist_cushion_v1: { description: "A comfy purple cloudlike cushion.", variant: "purple" },
      mist_cushion_v2: { description: "A comfy blue cloudlike cushion.", variant: "blue" },
      mist_cushion_v3: { description: "A comfy gray cloudlike cushion.", variant: "gray" },
      mist_cushion_v4: {
        description: "A comfy purple-blue cloudlike cushion.",
        variant: "purple_blue",
      },
    },
  },
  {
    name: "Mist Double Bed",
    named: {
      mist_double_bed_v1: {
        description:
          "A cloudlike double bed with sparkly print sheets, perfect for daydreaming on.",
        variant: "sparkly",
      },
      mist_double_bed_v2: {
        description: "A cloudlike double bed with moon print sheets, perfect for daydreaming on.",
        variant: "moon",
      },
      mist_double_bed_v3: {
        description:
          "A cloudlike double bed with raindrop print sheets, perfect for daydreaming on.",
        variant: "raindrop",
      },
      mist_double_bed_v4: {
        description:
          "A cloudlike double bed with lightning print sheets, perfect for daydreaming on.",
        variant: "lightning",
      },
    },
  },
  {
    name: "Mist Lamp",
    named: {
      mist_lamp_v1: {
        description: "A floating purple cloud of mist that glows from within.",
        variant: "purple",
      },
      mist_lamp_v2: {
        description: "A floating blue cloud of mist that glows from within.",
        variant: "blue",
      },
      mist_lamp_v3: {
        description: "A floating gray cloud of mist that glows from within.",
        variant: "gray",
      },
      mist_lamp_v4: {
        description: "A floating purple-blue cloud of mist that glows from within.",
        variant: "purple_blue",
      },
    },
  },
  {
    name: "Mist Pet Bed",
    named: {
      mist_pet_bed_v1: {
        description: "A cloudlike purple pet bed, perfect for your pet to daydream on.",
        variant: "purple",
      },
      mist_pet_bed_v2: {
        description: "A cloudlike blue and yellow pet bed, perfect for your pet to daydream on.",
        variant: "blue_and_yellow",
      },
      mist_pet_bed_v3: {
        description: "A cloudlike gray pet bed, perfect for your pet to daydream on.",
        variant: "gray",
      },
      mist_pet_bed_v4: {
        description:
          "A cloudlike purple-blue and yellow pet bed, perfect for your pet to daydream on.",
        variant: "purple_blue_and_yellow",
      },
    },
  },
  {
    name: "Mist Rug",
    named: {
      mist_rug_v1: { description: "A comfy purple cloudlike rug.", variant: "purple" },
      mist_rug_v2: { description: "A comfy white cloudlike rug.", variant: "white" },
      mist_rug_v3: { description: "A comfy gray cloudlike rug.", variant: "gray" },
      mist_rug_v4: { description: "A comfy purple-blue cloudlike rug.", variant: "purple_blue" },
    },
  },
  {
    name: "Mist Storage Chest",
    named: {
      mist_storage_chest_v1: {
        description: "An extra-large storage chest that looks just like a purple Mist Spot.",
        variant: "purple",
      },
      mist_storage_chest_v2: {
        description: "An extra-large storage chest that looks just like a white Mist Spot.",
        variant: "white",
      },
      mist_storage_chest_v3: {
        description: "An extra-large storage storage chest that looks just like a gray Mist Spot.",
        variant: "gray",
      },
      mist_storage_chest_v4: {
        description: "An extra-large storage chest that looks just like a purple-blue Mist Spot.",
        variant: "purple_blue",
      },
    },
  },
  {
    name: "Mostly Broken String Lights",
    reason: "Identical descriptions, and the IDs differ only by version number.",
    unnamed: {
      dingy_string_lights_v1: "These stringlights are nearly useless.",
      dingy_string_lights_v2: "These stringlights are nearly useless.",
    },
  },
  {
    name: "Mouse Hole",
    reason: "Identical descriptions, and the IDs differ only by version number.",
    unnamed: {
      dingy_mouse_hole_v1: "The entrance to a cozy mouse home.",
      dingy_mouse_hole_v2: "The entrance to a cozy mouse home.",
    },
  },
  {
    name: "Nautical Compass",
    named: {
      pirate_nautical_compass_v1: { description: "A green nautical compass.", variant: "green" },
      pirate_nautical_compass_v2: { description: "A yellow nautical compass.", variant: "yellow" },
    },
  },
  {
    name: "Ornate Banister",
    named: {
      ornate_banister_oak: {
        description: "A banister carved from oak wood. Place two or more together to connect them!",
        variant: "oak",
      },
      ornate_banister_walnut: {
        description:
          "A banister carved from walnut wood. Place two or more together to connect them!",
        variant: "walnut",
      },
      ornate_banister_white: {
        description:
          "A banister carved from white wood. Place two or more together to connect them!",
        variant: "white",
      },
    },
  },
  {
    name: "Ornate Cabinet",
    named: {
      ornate_cabinet_v1: {
        description: "An intricately carved walnut cabinet with green decorations.",
        variant: "walnut_and_green",
      },
      ornate_cabinet_v2: {
        description: "An intricately carved walnut cabinet with gold decorations.",
        variant: "walnut_and_gold",
      },
      ornate_cabinet_v3: {
        description: "An intricately carved oak cabinet with white decorations.",
        variant: "oak_and_white",
      },
      ornate_cabinet_v4: {
        description: "An intricately carved white cabinet with gold decorations.",
        variant: "white_and_gold",
      },
    },
  },
  {
    name: "Ornate Coffee Table",
    named: {
      ornate_coffee_table_v1: {
        description: "An intricately carved walnut coffee table with green decorations.",
        variant: "walnut_and_green",
      },
      ornate_coffee_table_v2: {
        description: "An intricately carved walnut coffee table with gold decorations.",
        variant: "walnut_and_gold",
      },
      ornate_coffee_table_v3: {
        description: "An intricately carved oak coffee table with white decorations.",
        variant: "oak_and_white",
      },
      ornate_coffee_table_v4: {
        description: "An intricately carved white coffee table with gold decorations.",
        variant: "white_and_gold",
      },
    },
  },
  {
    name: "Ornate Flooring",
    named: {
      ornate_flooring_v1: {
        description: "Intricate walnut flooring with green accents.",
        variant: "walnut_and_green",
      },
      ornate_flooring_v2: {
        description: "Intricate walnut flooring with gold accents.",
        variant: "walnut_and_gold",
      },
      ornate_flooring_v3: {
        description: "Intricate oak flooring with white accents.",
        variant: "oak_and_white",
      },
      ornate_flooring_v4: {
        description: "Intricate white flooring with gold accents.",
        variant: "white_and_gold",
      },
    },
  },
  {
    name: "Ornate Painted Screen",
    named: {
      ornate_painted_screen_oak: {
        description: "A translucent, delicately painted screen in an oak frame.",
        variant: "oak",
      },
      ornate_painted_screen_walnut: {
        description: "A translucent, delicately painted screen in a walnut frame.",
        variant: "walnut",
      },
      ornate_painted_screen_white: {
        description: "A translucent, delicately painted screen in a white frame.",
        variant: "white",
      },
    },
  },
  {
    name: "Ornate Privacy Screen",
    named: {
      ornate_privacy_screen_v1: {
        description:
          "A tall walnut privacy screen with green decorations. Place two or more together to connect them!",
        variant: "walnut_and_green",
      },
      ornate_privacy_screen_v2: {
        description:
          "A tall walnut privacy screen with gold decorations. Place two or more together to connect them!",
        variant: "walnut_and_gold",
      },
      ornate_privacy_screen_v3: {
        description:
          "A tall oak privacy screen with white decorations. Place two or more together to connect them!",
        variant: "oak_and_white",
      },
      ornate_privacy_screen_v4: {
        description: "A tall white privacy screen. Place two or more together to connect them!",
        variant: "white",
      },
      ornate_privacy_screen_v5: {
        description: "A tall walnut privacy screen. Place two or more together to connect them!",
        variant: "walnut",
      },
    },
  },
  {
    name: "Ornate Sofa",
    named: {
      ornate_sofa_v1: {
        description: "A fine green tufted sofa with a walnut frame.",
        variant: "green",
      },
      ornate_sofa_v2: {
        description: "A fine gold-colored tufted sofa with a walnut frame.",
        variant: "gold",
      },
      ornate_sofa_v3: {
        description: "A fine off-white tufted sofa with an oak frame.",
        variant: "off_white",
      },
      ornate_sofa_v4: { description: "A fine white tufted sofa.", variant: "white" },
      ornate_sofa_v5: {
        description: "A fine purple tufted sofa with an oak frame.",
        variant: "purple",
      },
      ornate_sofa_v6: {
        description: "A fine black tufted sofa with an oak frame.",
        variant: "black",
      },
      ornate_sofa_v7: {
        description: "A fine brown tufted sofa with an oak frame.",
        variant: "brown",
      },
    },
  },
  {
    name: "Ornate Vase",
    named: {
      ornate_vase_blue: { description: "A fine blue ceramic vase.", variant: "blue" },
      ornate_vase_green: { description: "A fine green ceramic vase.", variant: "green" },
      ornate_vase_purple: { description: "A fine purple ceramic vase.", variant: "purple" },
      ornate_vase_white: { description: "A fine white ceramic vase.", variant: "white" },
    },
  },
  {
    name: "Ornate Wallpaper",
    named: {
      ornate_wallpaper_v1: {
        description: "Wallpaper with a carved walnut design and green accents.",
        variant: "walnut_and_green",
      },
      ornate_wallpaper_v2: {
        description: "Wallpaper with a carved walnut design and gold accents.",
        variant: "walnut_and_gold",
      },
      ornate_wallpaper_v3: {
        description: "Wallpaper with a carved oak design and white accents.",
        variant: "oak_and_white",
      },
      ornate_wallpaper_v4: {
        description: "Wallpaper with a carved white wood design and gold accents.",
        variant: "white_and_gold",
      },
    },
  },
  {
    name: "Peeling Wallpaper",
    reason: "Identical descriptions, and the IDs differ only by version number.",
    unnamed: {
      dingy_wallpaper_v1: "A faded and peeling wallpaper.",
      dingy_wallpaper_v2: "A faded and peeling wallpaper.",
    },
  },
  {
    name: "Pile of Laundry",
    reason: "Identical descriptions, and the IDs differ only by version number.",
    unnamed: {
      dingy_pile_of_laundry_v1: "A messy pile of unfolded laundry.",
      dingy_pile_of_laundry_v2: "A messy pile of unfolded laundry.",
    },
  },
  {
    name: "Pile of Newspapers",
    reason: "Identical descriptions, and the IDs differ only by version number.",
    unnamed: {
      dingy_pile_of_newspapers_v1: "A pile of very old newspapers.",
      dingy_pile_of_newspapers_v2: "A pile of very old newspapers.",
    },
  },
  {
    name: "Pirate Flag",
    named: {
      pirate_wall_flag_v1: { description: "A worn black pirate flag.", variant: "black" },
      pirate_wall_flag_v2: { description: "A worn brown pirate flag.", variant: "brown" },
    },
  },
  {
    name: "Pressed Lilac Hanging",
    named: {
      painting_lilac_v1: { description: "A pressed lilac in a oak frame.", variant: "oak" },
      painting_lilac_v2: { description: "A pressed lilac in a walnut frame.", variant: "walnut" },
    },
  },
  {
    name: "Pressed Mushroom Hanging",
    named: {
      painting_mushroom_v1: { description: "A pressed mushroom in a oak frame.", variant: "oak" },
      painting_mushroom_v2: {
        description: "A pressed mushroom in a walnut frame.",
        variant: "walnut",
      },
    },
  },
  {
    name: "Pumpkin Pile",
    named: {
      pumpkin_pile_black: { description: "A pile of decorative black pumpkins.", variant: "black" },
      pumpkin_pile_green: { description: "A pile of decorative green pumpkins.", variant: "green" },
      pumpkin_pile_orange: {
        description: "A pile of decorative orange pumpkins.",
        variant: "orange",
      },
      pumpkin_pile_purple: {
        description: "A pile of decorative purple pumpkins.",
        variant: "purple",
      },
      pumpkin_pile_white: { description: "A pile of decorative white pumpkins.", variant: "white" },
      pumpkin_pile_yellow: {
        description: "A pile of decorative yellow pumpkins.",
        variant: "yellow",
      },
    },
  },
  {
    name: "Rickety Table",
    reason: "Identical descriptions, and the IDs differ only by version number.",
    unnamed: {
      dingy_table_v1: "A table with one leg that's shorter than the others.",
      dingy_table_v2: "A table with one leg that's shorter than the others.",
    },
  },
  {
    name: "Ruins Floor Brazier",
    named: {
      ruins_floor_brazier_blue: {
        description: "A floor brazier filled with blue flames.",
        variant: "blue",
      },
      ruins_floor_brazier_orange: {
        description: "A floor brazier filled with orange flames.",
        variant: "orange",
      },
      ruins_floor_brazier_purple: {
        description: "A floor brazier filled with purple flames.",
        variant: "purple",
      },
    },
  },
  {
    name: "Ruins Pot",
    named: {
      ruins_pot1: { description: "A white goblet-shaped clay pot.", variant: "white_goblet" },
      ruins_pot2: { description: "An orange gourd-shaped clay pot.", variant: "orange_gourd" },
      ruins_pot5: { description: "A small cracked purple clay pot.", variant: "cracked_purple" },
    },
  },
  {
    name: "Ruins Window",
    named: {
      ruins_window_v1: {
        description:
          "A stone-framed window to the void. Interact when placed to toggle its animation!",
        variant: "stone_framed",
      },
      ruins_window_v2: {
        description:
          "A purple-framed window to the void. Interact when placed to toggle its animation!",
        variant: "purple_framed",
      },
      ruins_window_v3: {
        description:
          "A wood-framed window to the void. Interact when placed to toggle its animation!",
        variant: "wood_framed",
      },
    },
  },
  {
    name: "Set of Pressed Leaves",
    named: {
      painting_leaves_v1: { description: "A set of pressed leaves in oak frames.", variant: "oak" },
      painting_leaves_v2: {
        description: "A set of pressed leaves in walnut frames.",
        variant: "walnut",
      },
    },
  },
  {
    name: "Set of Pressed Wildflowers",
    named: {
      painting_wildflowers_v1: {
        description: "A set of pressed wildflowers in oak frames.",
        variant: "oak",
      },
      painting_wildflowers_v2: {
        description: "A set of pressed wildflowers in walnut frames.",
        variant: "walnut",
      },
    },
  },
  {
    name: "Ship in a Bottle",
    named: {
      pirate_ship_in_a_bottle_v1: {
        description: "A tiny brown pirate ship in a bottle.",
        variant: "brown",
      },
      pirate_ship_in_a_bottle_v2: {
        description: "A tiny yellow pirate ship in a bottle.",
        variant: "yellow",
      },
    },
  },
  {
    name: "Short Display Cabinet",
    named: {
      bonsai_low_cabinet_black: {
        description: "A short black cabinet for displaying precious objects.",
        variant: "black",
      },
      bonsai_low_cabinet_brown: {
        description: "A short walnut cabinet for displaying precious objects.",
        variant: "walnut",
      },
      bonsai_low_cabinet_light_brown: {
        description: "A short oak cabinet for displaying precious objects.",
        variant: "oak",
      },
      bonsai_low_cabinet_white: {
        description: "A short white cabinet for displaying precious objects.",
        variant: "white",
      },
    },
  },
  {
    name: "Short Display Stand",
    named: {
      bonsai_low_stand_black: {
        description: "A short black stand for displaying precious objects.",
        variant: "black",
      },
      bonsai_low_stand_brown: {
        description: "A short walnut stand for displaying precious objects.",
        variant: "walnut",
      },
      bonsai_low_stand_light_brown: {
        description: "A short oak stand for displaying precious objects.",
        variant: "oak",
      },
      bonsai_low_stand_white: {
        description: "A short white stand for displaying precious objects.",
        variant: "white",
      },
    },
  },
  {
    name: "Short Display Table",
    named: {
      bonsai_low_table_black: {
        description: "A short black table for displaying precious objects.",
        variant: "black",
      },
      bonsai_low_table_brown: {
        description: "A short walnut table for displaying precious objects.",
        variant: "walnut",
      },
      bonsai_low_table_light_brown: {
        description: "A short oak table for displaying precious objects.",
        variant: "oak",
      },
      bonsai_low_table_white: {
        description: "A short white table for displaying precious objects.",
        variant: "white",
      },
    },
  },
  {
    name: "Small Decorative Pumpkin",
    named: {
      small_decorative_pumpkin_black: {
        description: "A small black decorative pumpkin.",
        variant: "black",
      },
      small_decorative_pumpkin_green: {
        description: "A small green decorative pumpkin.",
        variant: "green",
      },
      small_decorative_pumpkin_orange: {
        description: "A small orange decorative pumpkin.",
        variant: "orange",
      },
      small_decorative_pumpkin_purple: {
        description: "A small purple decorative pumpkin.",
        variant: "purple",
      },
      small_decorative_pumpkin_white: {
        description: "A small white decorative pumpkin.",
        variant: "white",
      },
      small_decorative_pumpkin_yellow: {
        description: "A small yellow decorative pumpkin.",
        variant: "yellow",
      },
    },
  },
  {
    name: "Stone Path",
    named: {
      starter_stone_path: { description: "Paved stones for making paths.", variant: "single" },
      starter_stone_path_double: {
        description: "Paved stones for making paths.",
        variant: "double",
      },
    },
  },
  {
    name: "Strange Garden Stone",
    reason: "Identical descriptions, and the IDs differ only by version number.",
    unnamed: {
      strange_garden_stone_v1: "A strange decorative stone taken from a lake.",
      strange_garden_stone_v2: "A strange decorative stone taken from a lake.",
    },
  },
  {
    name: "Tall Display Stand",
    named: {
      bonsai_high_stand_black: {
        description: "A tall black stand for displaying precious objects.",
        variant: "black",
      },
      bonsai_high_stand_brown: {
        description: "A tall walnut stand for displaying precious objects.",
        variant: "walnut",
      },
      bonsai_high_stand_light_brown: {
        description: "A tall oak stand for displaying precious objects.",
        variant: "oak",
      },
      bonsai_high_stand_white: {
        description: "A tall white stand for displaying precious objects.",
        variant: "white",
      },
    },
  },
  {
    name: "Tattered Rug",
    reason: "Identical descriptions, and the IDs differ only by version number.",
    unnamed: {
      dingy_rug_v1: "A threadbare and tattered rug.",
      dingy_rug_v2: "A threadbare and tattered rug.",
    },
  },
  {
    name: "Water Altar",
    named: {
      dragon_water_altar_v1: { description: "A golden water altar.", variant: "plain" },
      dragon_water_altar_v2: {
        description: "A golden water altar with pink accents.",
        variant: "pink_accents",
      },
    },
  },
];
