<script lang="ts">
  import { IconMessageReport } from "@tabler/icons-svelte-runes";

  import PageHeader from "$lib/components/page-header.svelte";
  import { trackerData } from "$lib/data";
</script>

<svelte:head>
  <title>About — Mistria Field Guide</title>
  <meta
    name="description"
    content="All about the Mistria Field Guide! What it is, who made it, etc etc and so on."
  />
</svelte:head>

<PageHeader title="About" backHref="/data" backLabel="Back to data management" />

<div class="about-page">
  <section>
    <h2>Project status</h2>
    <p>
      The Mistria Field Guide is an independent, unofficial, & noncommercial fan project to help
      players track their progress in
      <a href="https://www.fieldsofmistria.com/">Fields of Mistria</a>.
    </p>
    <p>
      The guide is maintained by <a href="https://mrh.is/">Michael Helmbrecht</a>. It’s not
      affiliated with, endorsed by, supported by, or sponsored by
      <a href="https://www.npcstudio.com/">NPC Studio</a> (though, call me!).
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
      The current guide data was generated based on game version {trackerData.version}. When there's
      a game update, this guide will briefly be out of date while I update everything.
    </p>
  </section>

  <div class="divider"></div>

  <section>
    <h2>Questions & requests</h2>
    <p>
      Report issues through the feedback tool (the
      <IconMessageReport class="feedback-icon" aria-hidden="true" /> icon in the bottom toolbar) at any
      point! For anything more serious, you can also
      <a href="mailto:michael@mistria.fyi">contact me privately</a>.
    </p>
  </section>
</div>

<style>
  .about-page {
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding: 16px 16px 28px;
    font-size: 14px;
  }

  section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  h2 {
    color: var(--ink-muted);
    font-family: var(--font-controls);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  p {
    line-height: 1.6;
  }

  a {
    color: var(--ink);
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

  .divider {
    border-top: 1px solid color-mix(in srgb, var(--hairline) 50%, transparent);
  }
</style>
