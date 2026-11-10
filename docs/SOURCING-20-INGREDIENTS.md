# The 20-ingredient list — the reviewed research plan

**This is the list to research, before any research starts.** It is the
owner's original spec's table, turned into a research plan: for each
ingredient, the **forms** to research, the **substitutes** to research,
the **price bands** to research, and the **substitution limits** the
spec already states.

**Revised 2026-11-10 on the owner's review** — four fixes, all now
enforced by the checker:

1. `is_key` is a **recipe-line** property, not an ingredient one. The
   column is renamed "typically defines the dish (hint)" and is never
   stored on an ingredient.
2. **Forms are separated from substitutes.** A form is the same
   ingredient in another state; a substitute is a different product
   with its own researched suitability.
3. Gochujang has no "fresh" form, and huitlacoche's "imported" is an
   **import dependency**, not a form.
4. The checker is re-run, and its rules are mutation-tested.

The machine-readable form is `docs/SOURCING-20-INGREDIENTS.csv` — the
research batches read it, so the list is data, not prose.

**Source:** `.hermes/SPEC_SOURCING_ORIGINAL.md` in the private
`gustale-state` repo, recovered verbatim on 2026-11-10 (commit
`218c117`). It is the owner's own three overlapping drafts.

---

## The one thing to read before the table

> **The country columns in the owner's table are STARTING POINTS, NOT
> DATA.** The spec says so itself.

So **no country cell below is a finding.** The spec's "easy" and
"hard" columns are the owner's *hypothesis* about where to look first
— they are where the research starts, not where it lands. Every one of
them must be re-researched from a source, and the research may well
contradict the hypothesis.

**This is also §5.4's rule, and it is the rule that makes this task
real work rather than a copy.** A row that simply repeated the spec's
country columns would look finished and be worthless.

**Scope:** every ingredient is researched in **every** country — 259 of
them (the country tier measured on the live database, not the ~250 the
brief estimated). The spec's "Europe is never one profile" rule
applies: Europe is 44 countries, each with its own row.

---

## The list

The machine-readable list is `docs/SOURCING-20-INGREDIENTS.csv`, and it
is the **single copy** — the checker loads it rather than keeping a
second one, because a second copy of a list is a second list.

**Twenty-one rows, not twenty.** The owner's split of "Parmigiano
Reggiano and Pecorino" into two ingredients is one row more, because
the spec's one row covered two cheeses and the two are rated
separately. **18** typically define the dish, **3** do not
(`tamarind`, `asian-pear`, `epazote`).

`forms` is a **state** of the ingredient, and it is one of the seven the
live `ingredient_availability.form` CHECK constraint accepts. Everything
that is not a state — the part, the ripeness, the presentation, the
variety — is in **`product_category`**, which is what that column is
for. See ADR-008 Decision 19.

| # | ingredient | slug | forms (a state) | product_category (the specificity) | substitutes | hint |
|---|---|---|---|---|---|---|
| 1 | Coconut milk | `coconut-milk` | fresh, homemade, canned_or_packaged | packaged=packaged, canned=canned | coconut-cream | **yes** |
| 2 | Cassava | `cassava` | fresh, frozen | fresh-root=root, peeled=peeled | cassava-flour, tapioca-starch | **yes** |
| 3 | Plantain | `plantain` | fresh, frozen | ripe=ripe, green=green, frozen-slices=slices | green-banana | **yes** |
| 4 | Tamarind | `tamarind` | fresh, paste_or_concentrate, extract | pod=pod, paste=paste, concentrate=concentrate, juice=juice | tamarind-block | **no** |
| 5 | Saffron | `saffron` | dried, extract | threads=threads, powder=powder | — | **yes** |
| 6 | Preserved lemon | `preserved-lemon` | fresh | whole=whole | salted-lemon, zest-and-salt | **yes** |
| 7 | Curry leaves | `curry-leaves` | fresh, frozen, canned_or_packaged | brined=brined | — | **yes** |
| 8 | Makrut lime leaves | `makrut-lime-leaves` | fresh, frozen | — | makrut-lime-zest, ordinary-lime-zest | **yes** |
| 9 | Gochujang | `gochujang` | paste_or_concentrate | paste=paste | gochugaru-mix | **yes** |
| 10 | Doubanjiang | `doubanjiang` | paste_or_concentrate | paste=paste | generic-chili-bean-paste | **yes** |
| 11 | Fish sauce | `fish-sauce` | canned_or_packaged, paste_or_concentrate | bottled=bottled, paste=paste | — | **yes** |
| 12 | Fresh mozzarella di bufala | `fresh-mozzarella-di-bufala` | fresh | fresh-buffalo=buffalo mozzarella | fresh-cow-mozzarella, low-moisture-mozzarella, provolone | **yes** |
| 13 | Parmigiano Reggiano | `parmigiano-reggiano` | canned_or_packaged | parmigiano=Parmigiano Reggiano | grana-padano | **yes** |
| 14 | Pecorino | `pecorino` | canned_or_packaged | pecorino=Pecorino | — | **yes** |
| 15 | Ube | `ube` | fresh, frozen, extract | puree=puree | — | **yes** |
| 16 | Ackee | `ackee` | fresh, frozen, canned_or_packaged | canned=canned | — | **yes** |
| 17 | Huitlacoche | `huitlacoche` | fresh, canned_or_packaged | canned=canned | — | **yes** |
| 18 | Asian pear | `asian-pear` | fresh | fresh-nashi=nashi pear | bosc-pear | **no** |
| 19 | Pandan | `pandan` | fresh, extract | fresh-leaves=leaves, juice=juice, flavouring=flavouring | — | **yes** |
| 20 | Epazote | `epazote` | fresh, dried | — | — | **no** |
| 21 | Fresh corn masa | `fresh-corn-masa` | homemade | fresh-masa=fresh masa | masa-harina, corn-tortillas | **yes** |

## Forms and substitutes are NOT the same thing

**A FORM is a state of the same ingredient.** It is one of exactly
seven: `fresh`, `frozen`, `dried`, `canned_or_packaged`,
`paste_or_concentrate`, `extract`, `homemade`. Nothing else may appear
in the forms column.

**A SUBSTITUTE is a different product** that may serve in its place,
with its own availability, its own price band and its own suitability.

### The comparison is by MEANING, not by strings

The owner's correction: tamarind's `paste` and `concentrate` appeared
in **both** the forms column and the substitutes column, and a string
comparison cannot see that `tamarind-paste` and the form
`paste_or_concentrate` name the **same thing**.

So the checker compares **meaning**. A substitute is redundant when it
is the row's own ingredient in a state the row's forms already claim:

| the substitute | is it the same product? |
|---|---|
| `tamarind-paste` | **yes** — it is tamarind, in the paste state. Removed. |
| `tamarind-concentrate` | **yes** — tamarind, in the concentrate state. Removed. |
| `seedless-tamarind` | **yes** — tamarind, seedless. Removed. |
| `tamarind-block` | no — a pressed block of pulp is a different product. Kept. |
| `bosc-pear` | no — a different pear. Kept. |
| `gochugaru-mix` | no — a different paste. Kept. |
| `green-banana` | no — a different fruit. Kept. |
| `grana-padano` | no — a different cheese. Kept. |

**Sharing a state is not redundancy.** Two different products in the
same state is exactly what a substitute *is*.

### A label that is not a state is not a form

| the label | what it really is | where it goes |
|---|---|---|
| `pod`, `whole`, `peeled`, `root`, `leaves`, `nashi` | a part of the ingredient | `product_category` |
| `green`, `ripe` | a ripeness | `product_category` |
| `slices`, `puree` | a preparation | `product_category` |
| `canned`, `packaged`, `bottled`, `brined` | a state, spelled specifically | `canned_or_packaged` + `product_category` |
| `powder`, `threads` | a state, spelled specifically | `dried` + `product_category` |
| `juice`, `flavouring` | a state, spelled specifically | `extract` + `product_category` |
| `parmigiano`, `pecorino` | a **VARIETY** | a separate ingredient row |

**`parmigiano` and `pecorino` were varieties, not states**, and the
list had them as one ingredient with two forms. They are now two
ingredients, each with its own row, and their state is
`canned_or_packaged` — how they are sold — with the variety in
`product_category`.

### The grades are not substitutes

Fish sauce's `standard`, `lighter` and `premium` are the **same
product in different strengths**. They are recorded in
`product_category`, which is what carries a price difference. The
spec's sentence — *"A lighter fish sauce may be interchangeable in some
dishes. Soy sauce should not be presented as an equivalent substitute
because it changes the flavor profile."* — means two different things
and the checker keeps them apart:

- a **lighter fish sauce** is a permitted substitute, graded
  `approximate`, because the spec says it is interchangeable *in some
  dishes* — a conditional — and a lighter sauce is less salty, so the
  seasoning must be adjusted;
- **soy sauce is a prohibition**. No label may offer it, and the
  checker now reads the substitutes column for it, not only the limits
  text.

### Import dependency belongs on the COUNTRY row

An import dependency is a fact about **a country** — whether that
country must import the ingredient — and it is not a property of the
ingredient. The ingredient-level `import_dependency` column is gone.
Huitlacoche's "imported" is now a country-row fact: *is huitlacoche
imported in this country?*

### The prohibition and the approximation are not the same

The spec calls some things a prohibition and some an approximation,
and they are not interchangeable:

- **prohibited** — the spec says it must *not* be offered: soy sauce for
  fish sauce, safflower for saffron, parsley and cilantro for epazote;
- **an approximation** — the spec permits it *and says it is weaker*:
  purple sweet potato for ube ("should be marked as an
  approximation"), ordinary lime zest for makrut lime ("a weaker
  approximation").

The checker rejects the first in the substitutes column and demands the
second still be marked as one in the limits text.

## "Typically defines the dish" is a RECIPE-LINE hint, not an ingredient property

**`is_key` belongs to the recipe line, not to the ingredient.**
ADR-008 Decision 5 puts it on `recipe_ingredients`:

```
recipe_ingredients.is_key       boolean NOT NULL DEFAULT false
ingredients.ubiquitous           boolean NOT NULL DEFAULT false
```

The `ingredients` table has exactly **one** sourcing column, and it is
`ubiquitous` — the staples rule. `is_key` is not there, and adding it
there would be wrong: the same ingredient can be key in one recipe and
not in another, and a column on the ingredient would force one answer
on every recipe that uses it.

So the column is renamed **"typically defines the dish (hint)"**. It
is the list's editorial judgement — the owner's own reading of the
spec — and it is a **hint for setting the line**, never a value stored
on the ingredient. The research and the recipe lines carry it; the
ingredient row does not.

**17 key, 3 not.** The three **not**-key ingredients are **tamarind**,
**Asian pear** and **epazote** — each of which the spec describes with
an ordinary substitute that serves in most recipes (tamarind paste for
pods, Bosc for nashi, dried epazote for fresh).

The checker **rejects the list if the `is_key` column comes back**,
and it rejects a hint that is not `yes` or `no`.

---

## The substitution limits — the spec's own words

These are **limits**, not verdicts. Each one says what may serve and
what may not. The **suitability rating** for each candidate is a
research question (GUS-1107) and is **not** decided here.

| ingredient | the spec's limits (verbatim) |
|---|---|
| Coconut milk | Packaged coconut milk, fresh coconut milk, and coconut cream may be suitable depending on the recipe. Coconut cream is richer and is **not always a direct replacement**. |
| Cassava | Peeled or frozen cassava and cassava flour may be available. Cassava flour and tapioca starch **should not be treated as interchangeable** with fresh cassava. |
| Plantain | Ripe plantain, frozen plantain slices, or green bananas may work for cooked dishes, but ripeness and texture can change the result. |
| Tamarind | Tamarind paste or concentrate can replace pods in many recipes. It **is not suitable when** the whole pod is required for presentation. |
| Saffron | Saffron threads or saffron extract may be suitable. Safflower can reproduce the color but not the aroma and **should not be listed as an equivalent substitute**. |
| Preserved lemon | Salted lemon or lemon zest combined with salt can work in dressings and tagines, but it **does not reproduce** preserved-lemon texture. |
| Curry leaves | Frozen or brined curry leaves may be available. There is **no single herb with an equivalent flavor**. |
| Makrut lime leaves | Makrut leaves, frozen leaves, or makrut-lime zest may be suitable. Ordinary lime zest **is a weaker approximation**. |
| Gochujang | Gochugaru combined with fermented soybean or chili paste can approximate some recipes, but the flavor and sweetness **will differ**. |
| Doubanjiang | A generic chili bean paste may be suitable **only when the recipe does not depend** on a specific regional variety. |
| Fish sauce | A lighter fish sauce may be interchangeable in some dishes. Soy sauce **should not be presented as an equivalent substitute** because it changes the flavor profile. |
| Fresh mozzarella di bufala | Fresh cow’s-milk mozzarella can replace it in many dishes. Low-moisture mozzarella or provolone is suitable **only when melted rather than served fresh**. |
| Parmigiano Reggiano and Pecorino | Grana Padano, another aged hard cheese, or Pecorino may be suitable depending on saltiness and the recipe. |
| Ube | Ube puree or extract may be imported. Purple sweet potato **can reproduce color but not** the distinctive flavor and should be marked as an approximation. |
| Ackee | There is **no generally suitable substitute** for ackee in dishes where its flavor and texture define the dish. |
| Huitlacoche | Canned or imported huitlacoche is the closest alternative. Corn and mushroom **do not provide a suitable substitute**. |
| Asian pear | Bosc pears or locally available nashi may be suitable for cooking, but sweetness and texture **will differ**. |
| Pandan | Pandan extract or an approved pandan flavoring may work in many desserts, but it **does not reproduce** the aroma of fresh leaves. |
| Epazote | Dried epazote may be suitable where the dish does not depend on fresh-leaf aroma. Parsley and cilantro **are not equivalent substitutes**. |
| Fresh corn masa | Masa harina, fresh masa prepared from masa harina, or corn tortillas may be suitable depending on whether the recipe requires tortillas, masa, or a specific texture. |

**Seven of these name something that is NOT a substitute**, and the
research must honour that: safflower, soy sauce, corn-and-mushroom,
parsley-and-cilantro, ordinary lime zest (an approximation, not an
equivalent), purple sweet potato (colour only), and — for ackee — the
absence of any substitute at all. **That count is checked**, not
asserted: the checker looks for each of the seven phrases in the
ingredient that owns it, so the set cannot quietly lose one.

---

## The price catalogue — the second list

The spec's price catalogue names the products whose **cost varies
substantially between local and imported forms**:

- Gruyère, Emmental, and other Swiss-style cheeses used for fondue
- Parmesan, Pecorino, and other aged cheeses
- Fresh buffalo-milk mozzarella
- Coconut milk and coconut cream
- Saffron
- Vanilla
- Truffle and other high-value mushrooms
- Gochujang and doubanjiang
- Preserved lemon
- Tamarind paste
- Fresh curry leaves, makrut lime leaves, pandan, and epazote
- Fresh shiitake, enoki, and specialty mushrooms
- Asian pears
- Fresh cassava and plantain
- Imported nori, miso, and mirin

And the spec's rule for it:

> The catalogue should store prices for **specific product categories
> and package sizes** rather than broad ingredient names. For example,
> imported Gruyère blocks, locally produced Emmental, and grated
> domestic cheese should [be separate entries].

**Three of these price items are not in the 20-ingredient list** —
**vanilla**, **truffle and high-value mushrooms**, and **nori, miso and
mirin**. They are on the price catalogue but not the ingredient
table, so they need their own ingredient rows before they can be
priced. That is a small gap to close, and it is recorded here rather
than silently dropped.

---

## What the research must produce, per ingredient

For each ingredient, in **each** country:

1. a **country row** — availability (`common`, `occasional`,
   `seasonal`, `specialty_only`, `limited`, `unavailable`), the
   sourcing effort, and **a source**;
2. one row **per form** — because the rating selects the lowest-burden
   form, and the forms are where the real difference is (a dish is
   Easy in Germany if the *packaged* coconut milk is ordinary there);
3. a **price band** where the ingredient is in the price catalogue,
   with the **product category and package size** the spec demands;
4. **one row per substitute**, each with **its own researched
   suitability** — the substitute's availability and price in that
   country, and whether it is an equivalent substitute or only an
   approximation. The spec's limits travel with it: "coconut cream
   is richer and is not always a direct replacement", "provolone is
   suitable only when melted rather than served fresh", "ordinary lime
   zest is a weaker approximation". A substitute that is unavailable is
   a fact, and it is a different fact from the ingredient's;
5. an **import dependency** where the country must import it — that is
   what drives the price band up, and it is a fact about the COUNTRY,
   not a state of the ingredient.

**A substitute is never rated as a form.** The two have separate rows,
separate availability, separate prices and separate suitability. That
is the difference the owner's fix makes, and it is what lets the
rating say "coconut cream is a worse substitute here" without saying
"coconut cream is a form of coconut milk".

**Every row needs a source and a `last_reviewed` date.** A price
older than **12 months** counts as unknown for the price score.

---

## The checks

`scripts/check_sourcing_list.py` — run it on the CSV:

```
python3 scripts/check_sourcing_list.py docs/SOURCING-20-INGREDIENTS.csv
```

What it enforces, all of it in code so it cannot drift silently:

1. **The forms are one of the seven states.** A part, a presentation, a
   variety or a grade is rejected.
2. **The MEANING comparison** — a substitute that is the row's own
   ingredient in a state its forms already claim is the same product and
   is rejected.
3. **No substitute appears in the forms column.**
4. **The `import_dependency` column must not come back.** It is a
   country fact, not an ingredient fact.
5. **The split keeps both halves.** `parmigiano-reggiano` and
   `pecorino` must both be present.
6. **The spec's limits are VERBATIM.** A paraphrase is a drift, and the
   checker says what the spec says so the two can be compared.
7. **The prohibitions bind the substitutes column**, not only the
   limits text — because the substitutes column is what the researcher
   reads.
8. **The approximations stay marked** as approximations.
9. **The hint count**, derived from the data: 18 key / 3 not.

### The mutations

`scripts/test_check_sourcing_list.py` breaks the list ten ways and
asserts the checker says so. A checker that only ever sees a correct
list proves nothing.

```
python3 scripts/test_check_sourcing_list.py
```

The ten: tamarind's paste as a substitute as well as a form · seedless
tamarind duplicating the fresh form · a part listed as a form · a
variety listed as a form · the import-dependency column returning · the
cheese split losing a half · the spec's limits paraphrased · soy sauce
offered as a fish-sauce substitute · `local-nashi` returning as a form ·
the hint count drifting.

**10/10 caught.**

## The related documents

- `docs/ADR-008-ingredient-sourcing.md` — the ADR: the rating rules,
  the data model, the 16 fixture cases.
- `docs/STAGE-A-INGREDIENT-VOCABULARY.md` — the ingredient vocabulary
  (Gate A approved 2026-11-10).
- `docs/VOCABULARY-ADDITIONS.md` — the classes the 435-row vocabulary
  is missing, including tamarind and shrimp paste.
- `docs/SOURCING-20-INGREDIENTS.csv` — this list, machine-readable.
- `.hermes/SPEC_SOURCING_ORIGINAL.md` (in `gustale-state`) — the
  owner's original spec, verbatim.
