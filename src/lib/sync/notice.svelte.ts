/**
 * The one-shot “Got it!” note Home shows after a device starts following, with the time of the
 * save it applied. It lives only in the page, so a reload doesn't bring it back.
 */
let applied = $state<null | { modified: number }>(null);

export const syncNotice = {
  get applied(): null | { modified: number } {
    return applied;
  },
  dismiss(): void {
    applied = null;
  },
  show(modified: number): void {
    applied = { modified };
  },
};
