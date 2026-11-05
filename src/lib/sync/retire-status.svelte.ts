/**
 * Which pending retires the relay refused, so the sync card can stop saying it's still working on
 * them. It lives in memory: a refused retire tries again on the next visit, which starts over here.
 */
import { SvelteSet } from "svelte/reactivity";

import type { MailboxId } from "./follow.js";

const refused = new SvelteSet<MailboxId>();

export const retireStatus = {
  /** Records how a mailbox's latest attempt ended. */
  note(mailboxId: MailboxId, wasRefused: boolean): void {
    if (wasRefused) refused.add(mailboxId);
    else refused.delete(mailboxId);
  },
  /** Whether nothing in `pending` is still being tried. */
  stuck(pending: readonly { readonly mailboxId: MailboxId }[]): boolean {
    return pending.length > 0 && pending.every(({ mailboxId }) => refused.has(mailboxId));
  },
};
