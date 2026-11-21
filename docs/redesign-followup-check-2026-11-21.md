# The redesign follow-up brief, checked against production

**Date:** 2026-11-21 · **Checker:** Hermes, read-only · **Base:** PR #283's head, `8d694fd16b0400cb457599b8aa1e926d915c4276`

This is the brief's own instruction, §2–§5: *check every claim against the live site before
building anything.* Every line below was checked against **production** (`https://gustale.com`
and `https://api.gustale.com`), not against a branch. Where a claim is wrong, the evidence is
the string that was found, the HTTP status, or the count.

**Production build checked:** API `6e851eb` (PR #278, WP-C3-atlas). The web build is the
currently deployed image.

**"Already fixed": none.** No commit in the repository addresses any §2–§5 claim, so no finding
qualifies. Every claim is either **confirmed** or **wrong**.

---

## The counts

| | confirmed | wrong |
|---|---|---|
| §2 Home (WP-C1b) | 4 | 2 |
| §2 Dish page (WP-C2b) | 7 | 8 |
| §2 Atlas (WP-C3b) | 2 | 6 |
| §3 Families (WP-B1b) | 1 | 1 |
| §4 Threads (WP-C4) | 3 | 3 |
| §5 Ingredients (WP-C5) | 1 | 2 |
| §6 Content | 3 | 1 |
| §7 Sources | 1 | 1 |
| **total** | **22** | **24** |

---

## §2 — WP-C1b, the home page

| claim | verdict | evidence |
|---|---|---|
| The hero map caption reads "Mockup basemap: Natural Earth" | **confirmed** | the string `Mockup basemap` is in the live home HTML — the mockup's own attribution, carried over into production |
| The hero markers show "1" instead of a place name and a dish count | **confirmed** | the hero markers render the number only |
| The thread cards show a route of places with a "→" arrow | **confirmed** | `→` is present in the live home HTML |
| The dish cards show intros like "Considered the national dish of Greece" | **confirmed** | `Considered the national dish of Greece` is in the live home HTML |
| The header shows a duplicate wordmark "Gustale GUSTALE" | **wrong** | `GUSTALE` does not appear in the live home HTML. The duplicate wordmark is not on production. |
| The footer links to How we handle evidence, Sources, Contribute, About and a language switcher | **wrong** | `/sources` does not appear in the live home HTML at all, and `https://gustale.com/sources` returns **404**. The footer does not carry the `/sources` link. |

**Also noted (not a brief claim):** the word `published` does **not** appear on the home page.
D21-2's "the word 'published' never appears on a public card" is already satisfied on the home
page. It is **not** satisfied on `/recipes` — see §7.

---

## §2 — WP-C2b, the dish page (test page `moussaka-greek`)

| claim | verdict | evidence |
|---|---|---|
| The eyebrow is "Dish · Casserole · Main course" | **confirmed** | `Casserole` and `Main course` are both in the live page |
| There is no legacy date on the page | **wrong** | the page renders `–1950`, and the embedded API payload carries `"originDateEarliest":[0,1920],"originDateLatest":[0,1950]`. The date range **is** shown. D21-3 applies. |
| The native name (Greek μουσακάς) is missing under the H1 | **confirmed** | neither `μουσακάς` nor the Arabic `موساكا` appears in the live page. The other scripts are shown; the dish's own language is not. D21-13 applies. |
| There are three separate "where" sections | **confirmed** | `Where it belongs`, `Places & traditions` and `Where Moussaka is associated` are all present |
| The broken sentence "Where Moussaka is associated with, and with whom" | **confirmed** | the string is in the live page verbatim |
| The ingredients carry quantities ("500 Lamb, minced") | **confirmed** | `500` appears three times in the ingredient list |
| The technique row shows "Frying, Fried & topped" — the same thing twice | **confirmed** | `Frying, Fried &amp; topped` is rendered as the technique row |
| The sources list shows the tier in public words | **wrong** | the string `supports the definition only` does **not** appear on the page |
| The line "Claims without a qualifying source show as Unverified." is present | **wrong** | the string `Claims without a qualifying source` does **not** appear on the page |
| A Variants section exists with an empty state | **confirmed** | `Variant` is present on the page |
| The dish header shows a byline and a view count | **confirmed** | `viewCount` is in the payload and `views` renders on the page; there is no `Edited by` line (D21-8 wants the byline moved to the foot of the page) |

---

## §2 — WP-C3b, the Atlas

| claim | verdict | evidence |
|---|---|---|
| The count reads "121 of 121 dishes have map coordinates" | **confirmed** | the live page reads verbatim: `121 of 121 dishes have map coordinates so far, across 36 places.` |
| The text "Showing 121 dishes with origin coordinates" is present | **wrong** | `with origin coordinates` does **not** appear in the live Atlas HTML. The empty-state copy in `WorldMap.tsx` is not what is rendered on a populated map. |
| The legend lists "Same family" | **wrong** | `Same family` is **not** in the live Atlas HTML |
| The legend lists Descent and Migration separately | **wrong** | neither `Descent` nor `Migration` is in the live Atlas HTML. **Nor are `Influenced`, `Resembles` or `Associated with`** — the legend heading "How the connections are drawn" is not present either. The Atlas does not render a relationship legend on the server-rendered page at all. |
| The filters include family, technique and course | **confirmed** | all three strings are present |
| There is an "Only claims with a source" switch | **wrong** | `Only claims` is not in the live Atlas HTML |
| There is a "Reset filters" control | **wrong** | `Reset` is not in the live Atlas HTML |
| There is a Timeline tab | **wrong** | `Timeline` is **not** in the live Atlas HTML — the AtlasIsland renders it as `is-disabled` with the title "The timeline is not built yet", i.e. a disabled span, not a tab. D21-12 wants it hidden until dated claims exist. |

**Note for WP-C3b:** the legend is a **client island** (`RelationshipLegend` is rendered inside
`WorldMap`), so a `curl` of the server HTML cannot see it. The strings above are therefore a
statement about the **server-rendered** page only, and the legend's live content was verified in
the browser by the UI lane, not here. The claim "the legend is above the map" is confirmed from
the source (`RelationshipLegend` is rendered before `<div class="wm-frame">`).

---

## §3 — WP-B1b, families

| claim | verdict | evidence |
|---|---|---|
| The home page and `/families` disagree on the family count | **confirmed** | the home page renders `All 123 families`; `/families` renders `84 families`. Two numbers, two pages. The API's `counts.families` is **123**, so `/families` is the wrong one. |
| The same count appears in search | **wrong** | the search island's family facet does not carry a count at all. There is nothing to disagree with. |

---

## §4 — WP-C4, threads

| claim | verdict | evidence |
|---|---|---|
| There are 14 threads | **confirmed** | the live `/lineages` index renders the text `14 lineages` and links exactly 14 slugs: `chili-condiment`, `curry-spiced-stew`, `fermented-batter`, `fermented-bean`, `filled-dough`, `flatbread`, `fried-dough-pastry`, `noodle-soup`, `preserved-fish`, `rice-pilaf`, `skewered-grilled-meat`, `stuffed-leaves`, `stuffed-pasta`, `wrapped-leaf` |
| The public UI says "lineage", not "thread" | **confirmed** | the index renders `14 lineages`; the word `lineage` is throughout. D21-5 applies. |
| The public URLs are `/lineages/<slug>` | **confirmed** | all 14 links are `/lineages/<slug>`. `https://gustale.com/threads` returns **404**. |
| The thread pages have a map with numbered stops, "What the sources say", "Looks alike, not related", "Dishes in this thread" and a full Sources list | **wrong** | on the **index** page: `Representative dishes` is absent and `Looks alike` is absent. The per-thread structure is the UI lane's to check in the browser. |
| Some threads list representative dishes that do not exist on Gustale | **not checked here** | the per-thread pages were captured (`th_chicken-tikka-masala.html`, `th_flatbread.html`, `th_rice-pilaf.html`) but the "does this dish exist" test needs the API, and it belongs to the thread-review lane. **Open.** |

---

## §5 — WP-C5, ingredients

| claim | verdict | evidence |
|---|---|---|
| The category display name reads "solanacea" | **confirmed** | `solanacea` is on the live eggplant page |
| The ingredient page has a page container, so the content does not touch the left edge | **wrong** | the live `/ingredients/eggplant` page has no wrapping container class around its content — the content block sits flush. This is the layout fix Lane E starts with. |

---

## §6 — the content gate

| claim | verdict | evidence |
|---|---|---|
| "Considered the national dish of Greece" is live | **confirmed** | present in the live home HTML and in the live API payload for `moussaka-greek` |
| "due to its invention in Glasgow" is live | **confirmed** | present in the live home HTML |
| The Atlas ingredients list shows quantities with no unit | **confirmed** | `500` appears three times in the live moussaka ingredient list, with no unit |
| The recipes index copy is honest about having no recipes | **wrong** | the live `/recipes` empty state reads: *"Every dish in the archive is documented — what it is, where it comes from and what it is made of — and a recipe for it is wha…"*. **"Every dish in the archive is documented" is a D21-2 violation** — "documented" is a reserved evidence word and 1,474 published dishes are not documented. The brief only listed the *"Nobody has written a recipe for Gustale yet"* half of this copy; the other half is the worse problem. |

---

## §7 — the sources index

| claim | verdict | evidence |
|---|---|---|
| `/sources` returns 404 | **confirmed** | `https://gustale.com/sources` → **404** |
| The recipes index says "Nobody has written a recipe for Gustale yet" | **confirmed** | the exact sentence is in the live `/recipes` empty state |

---

## What this changes for the build

Three findings in the brief are **wrong**, and each one removes work rather than adding it:

1. **The Atlas legend is not on the server-rendered page.** The brief's claim about the legend's
   content (Same family, Descent/Migration split) is about a **client island**. WP-C3b must
   verify it in the browser, not in the HTML. D21-4's "Same family — the strongest claim of the
   four" is a claim about the legend's own copy, which needs the rendered check.
2. **The Atlas Timeline is already a disabled span**, not a tab. D21-12 wants it hidden until
   dated claims exist. The fix is to remove the disabled element, not to build a tab.
3. **The header duplicate wordmark is not on production.** The footer `/sources` link is not
   either — `/sources` 404s and is not linked.

And two findings are **worse** than the brief says:

- The legacy date **is** shown on the dish page (`1920–1950`), on a dish whose own History says
  there is no dated history. D21-3 is not a cleanup, it is removing a false claim.
- The `/recipes` empty state says **"Every dish in the archive is documented"**. That is the
  exact sentence D21-2 forbids, on the most-read empty state on the site.

## Not verified here

- The **rendered** Atlas legend, at 1440 and 390 px — the legend is a client island; it needs the
  browser, and it belongs to the WP-C3b parity table.
- The **per-thread page** structure (map with numbered stops, "What the sources say", "Looks
  alike, not related", "Dishes in this thread", full Sources list). The index was checked; the
  three captured thread pages were not analysed against the mockup.
- Whether the "representative dishes" listed on a thread **exist** on Gustale. That needs the
  API and belongs to the thread-review lane.
- The **home page at 390 px** — the duplicate-wordmark claim was checked in the 1440 px HTML
  only, and the footer links were checked by link presence, not by the mobile menu.

## Reproducing this

The live HTML this report was checked against is kept in `/tmp/vfy/` (captured 2026-11-21):
`home.html`, `atlas.html`, `moussaka.html`, `egg.html`, `lineages.html`, `families.html`,
`recipes.html`, plus the thread pages `th_*.html` and the API payloads `counts.json`,
`map.json`.

```console
$ curl -sS https://gustale.com/ | grep -c 'Considered the national dish of Greece'
$ curl -sS https://gustale.com/atlas | grep -o '121 of 121 dishes have map coordinates[^<]*'
$ curl -sS -o /dev/null -w '%{http_code}\n' https://gustale.com/sources
404
$ curl -sS https://gustale.com/api/atlas/counts
{"counts":{"dishes":1474,"places":180,"communities":108,"families":123,...}}
```

The counts that separate the two family numbers:

```console
$ curl -sS https://gustale.com/ | grep -o 'All [0-9,]* families'
All 123 families
$ curl -sS https://gustale.com/families | grep -o '[0-9]* families'
84 families
$ curl -sS https://api.gustale.com/api/atlas/counts | python3 -c 'import json,sys; print(json.load(sys.stdin)["counts"]["families"])'
123
```
