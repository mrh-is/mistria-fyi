<script lang="ts">
  import IconMessageReport from "@tabler/icons-svelte-runes/icons/message-report";
  import IconRobot from "@tabler/icons-svelte-runes/icons/robot";

  import { localizedHref } from "#lib/utils/localized-href.js";
  import { resolve } from "$app/paths";

  let {
    game,
    maintainer,
    onDisclosure,
    studio,
    version,
  }: {
    game: string;
    maintainer: string;
    onDisclosure: () => void;
    studio: string;
    version: string;
  } = $props();
</script>

<!-- eslint-disable local/no-hardcoded-ui-text -- Wuchale extracts the authored copy in this component. -->
<div class="about-page">
  <section>
    <h2>Project status</h2>
    <p>
      The Mistria Field Guide is an independent, unofficial, & noncommercial fan project to help
      players track their progress in <a href="https://www.fieldsofmistria.com/">{game}</a>.
    </p>
    <p>
      The guide is maintained by <a href="https://mrh.is/">{maintainer}</a>. It’s not affiliated
      with, endorsed by, supported by, or sponsored by
      <a href="https://www.npcstudio.com/">{studio}</a>
      (though, call me!).
    </p>
  </section>
  <div class="divider"></div>
  <section>
    <h2>Data</h2>
    <p>
      Fields of Mistria (the game) & all the content therein, including data & images, remain
      properties of NPC Studio & their respective rightsholders.
    </p>
    <p>
      {`The current guide data was generated based on game version ${version}. When there’s a game update, this guide will briefly be out of date while I update everything.`}
    </p>
  </section>
  <div class="divider"></div>
  <section>
    <h2>Questions & requests</h2>
    <p>
      Report issues through the feedback tool (the <IconMessageReport
        class="feedback-icon"
        aria-hidden="true"
      /> icon in the bottom toolbar) at any point! For anything more serious, you can also
      <a href="mailto:michael@mistria.fyi">contact me privately</a>.
    </p>
  </section>
  <footer>
    <ul class="about-page__footer">
      <li><a href={`${localizedHref("privacy")}?from=about`}>Privacy</a></li>
      <li>
        <!-- A build-generated static file (see src/lib/build/licenses.ts). -->
        <a href="{resolve('/')}licenses.txt" target="_blank" rel="noopener">Open-source licenses</a>
      </li>
      <li>
        <button type="button" onclick={onDisclosure}
          ><IconRobot class="size-3.5" />AI disclosure</button
        >
      </li>
    </ul>
  </footer>
</div>

<!-- eslint-enable local/no-hardcoded-ui-text -->

<style>
  .about-page {
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding: 16px 16px 28px;
    font-size: var(--text-sm);
  }

  section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  h2 {
    color: var(--color-ink-muted);
    font-family: var(--font-controls);
    font-size: var(--text-3xs);
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  p {
    line-height: 1.6;
  }

  a {
    color: var(--color-ink);
    text-decoration: underline;
    text-decoration-color: var(--primary);
    text-decoration-style: dotted;
    text-underline-offset: 3px;
  }

  a:is(:hover, :focus-visible) {
    text-decoration-style: solid;
  }

  :global(.feedback-icon) {
    display: inline-block;
    width: 1.15em;
    height: 1.15em;
    margin-inline: 0.08em;
    color: var(--primary);
    stroke-width: 2.25;
    vertical-align: -0.2em;
  }

  .about-page__footer {
    display: flex;
    margin: 0;
    padding: 0;
    list-style: none;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0 20px;
    padding-top: 8px;
    color: var(--color-ink-muted);
    font-family: var(--font-annotation);
    font-size: var(--text-2xs);
  }

  .about-page__footer li {
    display: flex;
    align-items: center;
  }

  /* No separator dots: the longer locales wrap, & a dot would dangle at a line's end or start. The
     gap & each link's underline keep the items distinct. */

  .about-page__footer :is(button, a) {
    display: inline-flex;
    min-height: 44px;
    align-items: center;
    gap: 4px;
    text-decoration: underline;
  }

  .about-page__footer :is(button, a):is(:hover, :focus-visible) {
    color: var(--color-ink);
  }

  .divider {
    border-top: 1px solid color-mix(in srgb, var(--color-ink-hairline) 50%, transparent);
  }
</style>
