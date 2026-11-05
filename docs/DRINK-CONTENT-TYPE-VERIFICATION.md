# The nine drink candidates — verification record

**PR 3 · GUS-1180 · `dishes.content_type` backfill**

Every candidate was checked against THREE independent sources before
its `content_type` was set:

1. **Wikipedia lead sentence** (REST `/api/rest_v1/page/summary`) — the
   same source the catalogue's own descriptions were taken from.
2. **Wikidata `P31`** (instance of), read from the article's own
   `wikibase_item` — a structured claim, not prose.
3. **Wikipedia category tree** — how the article is filed under
   "Drinks" vs "Desserts".

The catalogue's own `short_description` was then compared against
the three. Where the three disagreed, the item is listed as a
borderline case and the reason is given.

**No item was backfilled on the strength of the family tag alone.**
The family tag is what these records *currently* carry; it is not
evidence.

---

## The two the operator flagged

### Pelamushi — **NOT a drink.** Do not backfill as `drink`.

| source | says |
|---|---|
| Wikipedia lead | "Pelamushi or tatara is a Georgian **dessert porridge** … composed of a thick, hard **chilled jelly** made from grape juice and flour." |
| Wikipedia short description | "Georgian **dessert porridge**" |
| Wikidata P31 | `kissel`, `drink` |
| Wikipedia categories | `Georgian cuisine`, `Dessert stubs` — **no drinks category at all** |

**Verdict: dessert.** It is a chilled fruit-and-flour porridge eaten
with nuts. The Wikidata `drink` claim is the outlier and it is the
one source that disagrees with both the prose *and* the category
tree, so it is the one to discount.

The `drink` family tag it currently carries is exactly the reason
this field has to be editorial and explicit: a derived field would
have carried the tag's error forward and made Pelamushi a drink
forever.

**`content_type` = `dish`.** The family tag is left alone — that is
the legacy vocabulary's business, and it is retired in P3, not here.

### Buttermilk koldskål — **a drink.** The operator's doubt does not survive the sources.

| source | says |
|---|---|
| Wikipedia lead | "Buttermilk koldskål is a sweet cold dairy **beverage or dessert** eaten in Denmark." |
| Wikipedia short description | "Danish dairy **beverage/dessert**" |
| Wikidata P31 | `cold sweet soup` |
| Wikipedia categories | **`Danish drinks`**, `Danish desserts`, `Fermented dairy products`, `Milk dishes` |

**Verdict: drink, with a note.** It is filed under *both*
`Danish drinks` and `Danish desserts`, and the lead sentence says
"beverage **or** dessert". That is an honest ambiguity in the source
material, not an error in the record.

The tie-break: it is a **liquid** — cold buttermilk served in a
glass — and the operative ingredient is buttermilk, a fermented dairy
drink. `Danish desserts` reflects that it is eaten as a sweet
dessert course in Denmark, not that it is a confection. "Sweet cold
dairy beverage or dessert" describes a drink that doubles as a
dessert; the drink reading is the primary one.

**`content_type` = `drink`.**

---

## The full nine

| # | dish | Wikipedia lead says | Wikidata P31 | Wikipedia categories | verdict |
|---|---|---|---|---|---|
| 1 | **Buttermilk koldskål** | sweet cold dairy **beverage or dessert** | `cold sweet soup` | `Danish drinks`, `Danish desserts`, `Fermented dairy products`, `Milk dishes` | **drink** (borderline) |
| 2 | **Cendol** | traditional Southeast Asian **dessert** … served over shaved ice | `drink`, `dish`, `human food`, `type of food or dish`, `street food of Indonesia` | `Non-alcoholic drinks`, `Indonesian desserts`, `Coconut desserts`, `Frozen desserts`, `Mung bean desserts`, `Rice desserts`, `Vietnamese desserts`, `Malaysian desserts`, `Cambodian desserts`, `Bruneian desserts`, `Singaporean desserts`, `Laotian desserts`, `Thai desserts and snacks`, `Burmese desserts and snacks` | **drink** (borderline) |
| 3 | **Champurrado** | a chocolate-based atole, a warm and thick Mexican **beverage** | `dish` | `Chocolate drinks`, `Hot drinks`, `Maize-based drinks`, `Mexican drinks`, `Non-alcoholic drinks` | **drink** |
| 4 | **Pelamushi** | Georgian **dessert porridge** | `kissel`, `drink` | `Georgian cuisine`, `Dessert stubs` | **DESSERT** |
| 5 | **bir pletok** | a non-alcoholic Indonesian **drink** of the Betawi people | `drink`, `dish`, `human food`, `type of food or dish` | `Indonesian drinks`, `Non-alcoholic drinks`, `Beer in Indonesia` | **drink** |
| 6 | **es doger** | Indonesian coconut milk-based shaved ice **beverage** … served as a **dessert** | `drink`, `dish`, `human food`, `type of food or dish` | `Indonesian desserts`, `Coconut desserts`, `Frozen desserts`, `Dessert stubs` — **no drinks category** | **drink** (borderline) |
| 7 | **es goyobod** | a **Sundanese drink** from Indonesia … cold beverage similar to es campur | `dish`, `human food`, `type of food or dish` | `Indonesian drinks`, `Coconut drinks`, `Cold drinks` | **drink** |
| 8 | **neera** | palm nectar … **used as a drink** | `dish`, `human food`, `type of food or dish` | `Non-alcoholic drinks`, `Fermented drinks`, `Indian alcoholic beverages` | **drink** |
| 9 | **lassi** | a **yogurt-based beverage** with a smoothie-like consistency | `dish` | `Indian drinks`, `Bangladeshi drinks`, `Pakistani drinks`, `Yogurt-based drinks`, `Indian dairy products` | **drink** |

**Result: 8 drinks, 1 not.** Pelamushi is excluded. That is the same
eight that currently carry the `drink` family tag, plus lassi — the
ninth, which the operator named.

### Notes on the borderline cases

- **Cendol** — Wikipedia's *lead* calls it a dessert; its *category
  tree* files it under `Non-alcoholic drinks` alongside eleven
  dessert categories, and Wikidata says `drink`. It is a served
  dessert-drink: jelly strands in coconut milk and palm sugar over
  shaved ice. Served in a bowl or a glass, drunk through a straw or
  eaten with a spoon. Both readings are defensible. **Drink**, on the
  strength of the explicit `Non-alcoholic drinks` category and the
  Wikidata `drink` claim, against a lead sentence that also says
  "coconut milk base" and "sold by vendors at roadside stalls".

- **es doger** — the mirror image of Cendol. The category tree puts
  it under `Indonesian desserts` / `Frozen desserts` with **no**
  drinks category, and the lead calls it a "dessert"… but also
  "shaved ice **beverage**", and Wikidata says `drink`. **Drink**:
  it is a coconut-milk drink served over shaved ice, and the
  catalogue's own description already says "shaved-ice drink and
  dessert".

- **es goyobod** — Wikidata's P31 does *not* say `drink`, but its
  categories say `Indonesian drinks` and `Cold drinks`, and its lead
  says "drink" twice. The categories win over a generic `dish`
  claim.

- **Champurrado, lassi** — P31 says only `dish`. The lead, the
  short description, the categories (`Chocolate drinks` / `Hot
  drinks`; `Yogurt-based drinks`) and Wikidata's own one-line
  description ("chocolate beverage"; "yogurt-based drink from the
  Indian subcontinent") all say drink. P31 is simply coarse here.

- **neera** — Wikipedia's short description calls it "Palm nectar
  used as a drink", the lead says "used as a drink", and it is
  categorised under `Non-alcoholic drinks` and `Fermented drinks`.
  Note that the catalogue's own description says "An Indonesian palm
  drink" — neera is South Asian (India, Sri Lanka) rather than
  specifically Indonesian; that is a separate wording issue, out of
  scope for `content_type`, and is **not** changed here.

### What is NOT changed by this backfill

- No family tag is added, removed or rewritten. The `drink` family
  tag on these records is legacy vocabulary and is retired in P3.
- No description is rewritten.
- No `content_type` is set on anything outside this list. Every
  other dish keeps the default `dish`.
- **No sync trigger.** The column is set by a person and stays set.
  Changing a family tag does not change `content_type`, and changing
  `content_type` does not change a family tag.
