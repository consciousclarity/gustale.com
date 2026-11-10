# The 20-ingredient list — the reviewed research plan

**This is the list to research, before any research starts.** It is the
owner's original spec's table, turned into a research plan: for each
ingredient, the **forms** to research, the **price bands** to research,
and the **substitution limits** the spec already states.

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

| # | ingredient | slug | forms to research | is_key |
|---|---|---|---|---|
| 1 | Coconut milk | `coconut-milk` | fresh · homemade · packaged · canned · coconut-cream | **yes** |
| 2 | Cassava | `cassava` | fresh-root · peeled · frozen · cassava-flour · tapioca-starch | **yes** |
| 3 | Plantain | `plantain` | ripe · green · frozen-slices | **yes** |
| 4 | Tamarind | `tamarind` | pod · paste · concentrate · juice | no |
| 5 | Saffron | `saffron` | threads · powder · extract | **yes** |
| 6 | Preserved lemon | `preserved-lemon` | whole · salted-lemon · zest-and-salt | **yes** |
| 7 | Curry leaves | `curry-leaves` | fresh · frozen · brined | **yes** |
| 8 | Makrut lime leaves | `makrut-lime-leaves` | fresh · frozen · zest | **yes** |
| 9 | Gochujang | `gochujang` | fresh · paste · gochugaru-mix | **yes** |
| 10 | Doubanjiang | `doubanjiang` | paste · regional-varieties | **yes** |
| 11 | Fish sauce | `fish-sauce` | standard · lighter · premium | **yes** |
| 12 | Fresh mozzarella di bufala | `fresh-mozzarella-di-bufala` | fresh-buffalo · fresh-cow · low-moisture · provolone | **yes** |
| 13 | Parmigiano Reggiano and Pecorino | `parmigiano-reggiano-and-pecorino` | parmigiano · pecorino · grana-padano | **yes** |
| 14 | Ube | `ube` | fresh · frozen · puree · extract | **yes** |
| 15 | Ackee | `ackee` | fresh · frozen · canned | **yes** |
| 16 | Huitlacoche | `huitlacoche` | fresh · canned · imported | **yes** |
| 17 | Asian pear | `asian-pear` | fresh-nashi · bosc · local-nashi | no |
| 18 | Pandan | `pandan` | fresh-leaves · juice · extract · flavouring | **yes** |
| 19 | Epazote | `epazote` | fresh · dried | no |
| 20 | Fresh corn masa | `fresh-corn-masa` | fresh-masa · masa-harina · tortillas | **yes** |

**16 key, 4 not.** The `is_key` column follows ADR-008 Decision 5: an
approximate substitute never rescues a **key** ingredient. The spec
gives the reason for each — ackee "is a traditional ingredient… there
is no generally suitable substitute for ackee in dishes where its
flavour and texture define the dish", and so on.

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
4. **substitutes**, each with a researched suitability.

**Every row needs a source and a `last_reviewed` date.** A price
older than **12 months** counts as unknown for the price score.

---

## The checks

`scripts/check_sourcing_list.py` — the same shape as the other list
checkers, and **mutation-tested**. It enforces:

- the list is **exactly** these 20 rows — closed in **both**
  directions, so a row cannot be added *or* dropped;
- every ingredient's **name**, **forms**, **price bands** and
  **`is_key`** match the approved values exactly;
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
| **`is_key`** is flipped | ❌ fails ✅ |
| an **invented price band** | ❌ fails ✅ |
| the **forms** are emptied | ❌ fails ✅ |
| the **name** is changed | ❌ fails ✅ |

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
