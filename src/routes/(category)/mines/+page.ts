import { categoryColor } from "#lib/data/categories.js";
import { localizedPageLoad } from "#lib/data/page-load.js";
import * as m from "#lib/ui-messages/messages.js";

import type { PageLoad } from "./$types";

export const load: PageLoad = localizedPageLoad(["mines", "spells"], (locale) => ({
  accent: categoryColor("mines"),
  description: m.mines_page_description({}, { locale }),
  title: m.category_mines_name({}, { locale }),
  toolbar: { clock: true, filter: true, search: true },
}));
