import { expect, it } from "vitest";

import LedgerSprite from "#lib/components/ledger/ledger-sprite.svelte";
import { renderToFragment } from "#lib/test-utils/render-to-fragment.js";

it("server-renders the sprite without inline image event handlers", () => {
  const { container } = renderToFragment(LedgerSprite, {
    props: { name: "Balor", treatment: "completed", url: "/balor.png" },
  });

  const image = container.querySelector('img[src="/balor.png"]');
  expect(image?.getAttributeNames()).toBeDefined();
  expect(image?.getAttributeNames()).not.toEqual(
    expect.arrayContaining([expect.stringMatching(/^on/)]),
  );
});
