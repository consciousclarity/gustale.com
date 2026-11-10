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

| # | ingredient | slug | forms to research | substitutes to research |
|---|---|---|---|---|
| 1 | Coconut milk | `coconut-milk` | fresh · homemade · packaged · canned | coconut-cream |
| 2 | Cassava | `cassava` | fresh-root · peeled · frozen | cassava-flour · tapioca-starch |
| 3 | Plantain | `plantain` | ripe · green · frozen-slices | green-banana |
| 4 | Tamarind | `tamarind` | pod · paste · concentrate · juice | tamarind-paste · tamarind-concentrate |
| 5 | Saffron | `saffron` | threads · powder · extract | — |
| 6 | Preserved lemon | `preserved-lemon` | whole | salted-lemon · zest-and-salt |
| 7 | Curry leaves | `curry-leaves` | fresh · frozen · brined | — |
| 8 | Makrut lime leaves | `makrut-lime-leaves` | fresh · frozen | makrut-lime-zest · ordinary-lime-zest |
| 9 | Gochujang | `gochujang` | paste | gochugaru-mix |
| 10 | Doubanjiang | `doubanjiang` | paste | generic-chili-bean-paste |
| 11 | Fish sauce | `fish-sauce` | bottled · paste | lighter-fish-sauce |
| 12 | Fresh mozzarella di bufala | `fresh-mozzarella-di-bufala` | fresh-buffalo | fresh-cow-mozzarella · low-moisture-mozzarella · provolone |
| 13 | Parmigiano Reggiano and Pecorino | `parmigiano-reggiano-and-pecorino` | parmigiano · pecorino | grana-padano |
| 14 | Ube | `ube` | fresh · frozen · puree · extract | — |
| 15 | Ackee | `ackee` | fresh · frozen · canned | — |
| 16 | Huitlacoche | `huitlacoche` | fresh · canned | — |
| 17 | Asian pear | `asian-pear` | fresh-nashi · local-nashi | bosc-pear |
| 18 | Pandan | `pandan` | fresh-leaves · juice · extract · flavouring | — |
| 19 | Epazote | `epazote` | fresh · dried | — |
| 20 | Fresh corn masa | `fresh-corn-masa` | fresh-masa | masa-harina · corn-tortillas |

---

## Forms and substitutes are NOT the same thing

**This is the distinction the whole dataset turns on**, and it is the
owner's, made explicit:

> A **FORM** is the same ingredient in another state — fresh, frozen,
> dried, canned/packaged, paste/concentrate, extract, homemade.
>
> A **SUBSTITUTE** is a different product that may serve in its place,
> and it has **its own suitability**, which must be researched.

The difference is not cosmetic. The rating picks the **lowest-burden
form** of the ingredient, and it evaluates a **substitute** on its own
merits — so a substitute listed as a form would be rated as if it were
the ingredient itself. "Coconut cream is not always a direct
replacement" (the spec's words); "provolone is suitable only when
melted rather than served fresh" (the spec's words). Those are
*suitability* judgements about a different product, and they cannot be
expressed by calling it a form.

The **forms** are the states the rating may choose between. The
**substitutes** are the candidates the research must rate *as
substitutes*, with the spec's limit carried along.

**The checker enforces the split.** Every form must be in the form
vocabulary, and no approved substitute may appear in the forms column.
A form that names a different product — coconut cream, provolone,
tortillas — is simply not in the vocabulary, so it cannot be smuggled
back in.

### The three the owner's fix named, and what they are now

| was a "form" | now | why |
|---|---|---|
| `coconut-cream` | a **substitute** | richer, "not always a direct replacement" |
| `cassava-flour`, `tapioca-starch` | **substitutes** | "should not be treated as interchangeable with fresh cassava" |
| `fresh-cow`, `low-moisture`, `provolone` | **substitutes** | provolone "only when melted rather than served fresh" |
| `grana-padano` | a **substitute** | "another aged hard cheese" |
| `bosc` | a **substitute** | "sweetness and texture will differ" |
| `gochugaru-mix` | a **substitute** | "the flavor and sweetness will differ" |
| `salted-lemon`, `zest-and-salt` | **substitutes** | "does not reproduce preserved-lemon texture" |
| `makrut-lime-zest`, `ordinary-lime-zest` | **substitutes** | ordinary lime zest is "a weaker approximation" |
| `tortillas`, `masa-harina` | **substitutes** | depend "on whether the recipe requires tortillas, masa, or a specific texture" |

### Two the owner's fix caught that I had wrong

**Gochujang has no "fresh" form.** It is a fermented paste — there is no
fresh gochujang. The spec's own wording says "where fresh gochujang is
a common ingredient", and that is the spec's loose phrase, not a
state of the product. The form is `paste`; the substitute is
`gochugaru-mix`.

**Huitlacoche's "imported" is an import dependency, not a form.** It is
now its own column. Being import-dependent is a *fact about a country*,
not a state of the ingredient — it is what the price band records when
a country must import it.

### And one the CHECKER caught, which the owner's fix did not name

**Fish sauce's "standard / lighter / premium" are grades, not
states.** They are not forms of fish sauce in the sense of the
vocabulary, and "lighter" is named by the spec as a possible
*interchange* — so it is a substitute. The forms are now `bottled` and
`paste`; the grade difference is what the **price band** records, which
is where a grade belongs.

---

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

`scripts/check_sourcing_list.py` — the same shape as the other list
checkers, and **mutation-tested**. It enforces:

- the list is **exactly** these 20 rows — closed in **both**
  directions, so a row cannot be added *or* dropped;
- every ingredient's **name**, **forms**, **substitutes**,
  **import dependency**, **price bands** and **"typically defines the
  dish" hint** match the approved values exactly;
- **every form is in the form vocabulary**, and **no approved
  substitute appears in the forms column** — the split is enforced,
  not asserted;
- the **`is_key` column is gone**, and the hint column is present —
  because `is_key` belongs to `recipe_ingredients`, never to the
  ingredient;
- the **substitution limits** are carried **verbatim** from the
  owner's spec — the research must not lose them, and it must not
  paraphrase them either;
- the **seven prohibitions** are present in the seven ingredients that
  have them (safflower, soy sauce, corn-and-mushroom,
  parsley-and-cilantro, ordinary lime zest, purple sweet potato, and
  ackee's having no substitute at all);
- the three **price-catalogue ingredients with no ingredient row**
  (vanilla, truffle and high-value mushrooms, nori/miso/mirin) are
  recorded as a known gap, not silently dropped.

### The mutations

Every one of these **fails** the check:

| mutation | result |
|---|---|
| a row is **deleted** | ❌ fails ✅ |
| a row is **added** | ❌ fails ✅ |
| the limits are **paraphrased** | ❌ fails ✅ |
| a **prohibition** is dropped | ❌ fails ✅ |
| the **hint** is flipped | ❌ fails ✅ |
| the **`is_key` column is restored** | ❌ fails ✅ |
| a **substitute is put back in the forms** | ❌ fails ✅ |
| an **approved substitute is dropped** | ❌ fails ✅ |
| the **import dependency is put back in the forms** | ❌ fails ✅ |
| gochujang gets a **"fresh" form** back | ❌ fails ✅ |
| an **invented form** (not a state of the ingredient) | ❌ fails ✅ |
| an **invented price band** | ❌ fails ✅ |
| the **forms** are emptied | ❌ fails ✅ |
| the **name** is changed | ❌ fails ✅ |

**The form vocabulary earned its place immediately too.** The owner's
fourth fix asked for the checker to be re-run after the change; the
re-run **failed**, on fish sauce. Its "standard / lighter / premium"
are **grades**, not states of the ingredient — and "lighter" is named
by the spec as a possible *interchange*, so it is a substitute. The
checker caught a category error the owner's fix had not named, which is
the point of running it.

**The verbatim-limits check earned its place immediately.** The first
version of this list paraphrased the spec — "chilli" for the spec's
"chili", "flavour" for "flavor", and emphatic capitals where the spec
had plain words — and the checker rejected all of it. The spec's
wording is the owner's, and a research batch must inherit it exactly:
the prohibition on soy sauce is only sharp if it is the owner's own
sentence.

---

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
