# Mistria wiki API reference

> The community wiki at <https://fieldsofmistria.wiki.gg/> runs MediaWiki 1.43 and exposes the
> standard MediaWiki API. It is **not official** and is **not always up to date** with the latest
> game version. Treat it as a useful supplementary resource, not a source of truth.

**Base endpoint:** `https://fieldsofmistria.wiki.gg/api.php`

---

## When to use the wiki

- Cross-referencing extracted pipeline data against community-documented values.
- Looking up game mechanics, recipes, or relationships not present in the TOML game assets.
- Discovering item names, categories, or seasonal availability for verification.
- Researching new content added in game updates that hasn't reached the pipeline yet.

Do **not** treat wiki data as authoritative. The TOML game assets (`pipeline/input/`) are the
primary data source for the pipeline. When the wiki and game assets disagree, the game assets win.

---

## Common query patterns

All examples use `format=json`. Append `&formatversion=2` for cleaner JSON output (flat arrays
instead of keyed-by-title objects).

### Search for pages

```
?action=query&list=search&srsearch=tomato&srlimit=10&format=json
```

### Get raw wikitext for a page

```
?action=query&titles=Tomato&prop=revisions&rvprop=content&rvslots=main&format=json
```

The wikitext is in `response.query.pages[id].revisions[0].slots.main["*"]` (or `.content` with
`formatversion=2`).

### Parse a page to HTML

```
?action=parse&page=Tomato&format=json
```

Returns rendered HTML, categories, links, and sections. Add `&prop=sections` to get only the table
of contents, or `&prop=wikitext` for the raw source via the parse endpoint.

### List category members

```
?action=query&list=categorymembers&cmtitle=Category:Crops&cmlimit=50&format=json
```

Results are paginated. When `continue` appears in the response, pass its values as query parameters
to fetch the next page.

### List all categories

```
?action=query&list=allcategories&aclimit=50&format=json
```

Useful categories include: `Crops`, `Items`, `Characters`, `Cooked Dishes`, `Animals`, `Artifacts`,
`Bugs`, `Bundle`, `Cosmetics`, `Currency`, and seasonal categories like `Spring`, `Summer`, `Fall`,
`Winter`.

### Get site metadata

```
?action=query&meta=siteinfo&siprop=general&format=json
```

---

## Page structure conventions

Individual item pages (e.g. "Tomato") typically use an `Infobox item` template with fields like:

- `image`, `description`, `source` (acquisition methods)
- `stamina`, `health`, `sell` (numeric stats)
- `seed`, `growth`, `regrowth`, `season` (crop-specific)

List pages (e.g. "Crops") use specialized table templates like `CropsTable` parameterized by season.

---

## Pagination

The API returns at most `cmlimit` / `srlimit` results per request. When more results exist, the
response includes a `continue` object. Pass its key-value pairs as additional query parameters on
the next request to fetch the following page.

---

## Rate limiting

No explicit rate limits are documented for anonymous read queries. Be respectful: add a short delay
between bulk requests and avoid hammering the API in tight loops. A 200–500 ms delay between
sequential requests is a reasonable default for batch operations.
