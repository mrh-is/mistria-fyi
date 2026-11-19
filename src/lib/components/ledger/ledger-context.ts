import { getContext, setContext } from "svelte";

/** What the page's index offers the sections inside it. */
export interface LedgerIndexContext {
  /** The jump list's popover id, while the index rail is hidden; otherwise `undefined`. */
  readonly jumpList: string | undefined;
}

const key = Symbol("ledger-index");

export function setLedgerIndexContext(context: LedgerIndexContext): void {
  setContext(key, context);
}

export function getLedgerIndexContext(): LedgerIndexContext | undefined {
  return getContext<LedgerIndexContext | undefined>(key);
}
