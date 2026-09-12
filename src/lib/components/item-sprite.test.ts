import { render } from "svelte/server";
import { describe, expect, it } from "vitest";

import ItemSprite from "$lib/components/item-sprite.svelte";

describe("ItemSprite", () => {
  const sprite = "spr_ui_item_turnip";

  it("renders the permanent printed spot and a gray silhouette when spoilered", () => {
    const { body } = render(ItemSprite, { props: { sprite, state: "spoilered" } });

    expect(body).toContain('data-item-sprite="spoilered"');
    expect(body).toContain('data-sprite-layer="spot"');
    expect(body).toContain('data-sprite-layer="silhouette"');
    expect(body).not.toContain('data-sprite-layer="sticker"');
    expect(body).toContain(`/sprites/${sprite}.webp`);
  });

  it("uses an eroded category tint and activates the spot when ready", () => {
    const { body } = render(ItemSprite, { props: { sprite, state: "ready" } });

    expect(body).toContain('data-item-sprite="ready"');
    expect(body).toContain("feMorphology");
    expect(body).toContain('operator="erode"');
    expect(body).toContain('data-spot-active="true"');
    expect(body).not.toContain('data-sprite-layer="sticker"');
  });

  it("layers a tilted full-color sticker over the gray silhouette when complete", () => {
    const { body } = render(ItemSprite, { props: { sprite, state: "complete" } });

    expect(body).toContain('data-item-sprite="complete"');
    expect(body).toContain('data-sprite-layer="silhouette"');
    expect(body).toContain('data-sprite-layer="sticker"');
    expect(body).toContain("rotate(2.5deg)");
  });
});
