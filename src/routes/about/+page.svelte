<script lang="ts">
  import IconMessageReport from "@tabler/icons-svelte-runes/icons/message-report";
  import IconRobot from "@tabler/icons-svelte-runes/icons/robot";

  import AiDisclosureDialog from "$lib/components/ai-disclosure-dialog.svelte";
  import PageHeader from "$lib/components/page-header.svelte";
  import { trackerData } from "$lib/data";
  import * as m from "$lib/paraglide/messages.js";
  import { localizedHref } from "$lib/utils/localized-href.js";

  let aiDisclosureOpen = $state(false);

  function goBack(event: MouseEvent): void {
    if (history.length <= 1) return;
    event.preventDefault();
    history.back();
  }
</script>

<PageHeader title={m.about_title()} backLabel={m.common_go_back()} onback={goBack} />

<div class="about-page">
  <!-- eslint-disable local/no-hardcoded-ui-text -- proper nouns (product/person/studio names), same in every locale -->
  <section>
    <h2>{m.about_status_heading()}</h2>
    <p>
      {m.about_status_intro()}
      <a href="https://www.fieldsofmistria.com/">Fields of Mistria</a>.
    </p>
    <p>
      {m.about_maintainer_intro()} <a href="https://mrh.is/">Michael Helmbrecht</a>.
      {m.about_maintainer_suffix()}
      <a href="https://www.villagerstudio.com/">Villager Studio</a>
      {m.about_maintainer_suffix2()}
    </p>
  </section>
  <!-- eslint-enable local/no-hardcoded-ui-text -->

  <div class="divider"></div>

  <section>
    <h2>{m.about_data_heading()}</h2>
    <p>
      {m.about_data_rights()}
    </p>
    <p>
      {m.about_data_version_notice({ version: trackerData.version })}
    </p>
  </section>

  <div class="divider"></div>

  <section>
    <h2>{m.about_questions_heading()}</h2>
    <p>
      {m.about_questions_intro_before_icon()}
      <IconMessageReport class="feedback-icon" aria-hidden="true" />
      {m.about_questions_intro_after_icon()}
      <a href="mailto:michael@mistria.fyi">{m.about_contact_privately_link()}</a>.
    </p>
  </section>

  <footer class="about-page__footer">
    <a href={localizedHref("/privacy")}>{m.about_privacy_link()}</a>
    <span>·</span>
    <button type="button" onclick={() => (aiDisclosureOpen = true)}>
      <IconRobot class="size-3.5" />{m.about_ai_disclosure_link()}
    </button>
  </footer>
</div>

<AiDisclosureDialog bind:open={aiDisclosureOpen} />

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
    color: var(--ink-muted);
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

  .about-page__footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0 8px;
    padding-top: 8px;
    color: var(--ink-muted);
    font-family: var(--font-annotation);
    font-size: var(--text-2xs);
  }

  .about-page__footer :is(button, a) {
    display: inline-flex;
    min-height: 44px;
    align-items: center;
    gap: 4px;
    text-decoration: underline;
  }

  .about-page__footer :is(button, a):is(:hover, :focus-visible) {
    color: var(--ink);
  }

  .divider {
    border-top: 1px solid color-mix(in srgb, var(--hairline) 50%, transparent);
  }
</style>
