# Family taxonomy — classification and orphan map

**For Alejandro's one-pass approval.** Two things in one table:
the **123** families that carry published dishes, each classified
FORM / COURSE / CUISINE / CONTENT TYPE; and the **109-orphan map**
— the legacy `categories` rows that carry no published dish.

**Status:** **the classification is APPROVED** by Alejandro on
2026-11-06 ("I approve the 5 approvals") and applied by
`db/migrations/0051_family_classification.sql`, which adds
`dish_families.family_class` and fills it in for all 306 families.

The document's own closing question — *"Whether the classification is
applied to the schema. The classes are currently editorial — they are
not a column anywhere. If they should become one, that is a
migration."* — is settled: **it is a migration, and it is written.**

The classification is **rule-derived**, and every rule is printed below
so it can be audited rather than trusted. The transcription from this
document into the migration is checked by
`scripts/hermes/extract-family-classification.py`, which re-parses
these tables and verifies the parse against the class split this
document prints (`FORM 83 · COURSE 21 · CUISINE 4 · CONTENT TYPE 15`
for the 123 that carry a published dish).

**Measured against the live database**, 2026-11-05 (this document) and
2026-11-06 (the implementation).

---

## What the implementation found

The document's 306 classifications and the database's 306 families are
the **same 306, in both directions** — checked, not assumed:

| check | result |
|---|---|
| classified in the document | 306 |
| `dish_families` rows | 306 |
| document slugs missing from the database | **0** |
| database families not classified | **0** |
| families carrying a published dish | **123** |

Two class splits exist, and the migration asserts both:

| | FORM | COURSE | CUISINE | CONTENT TYPE | total |
|---|---|---|---|---|---|
| the 123 with a published dish | 83 | 21 | 4 | 15 | 123 |
| all 306 | 172 | 59 | 5 | 70 | 306 |

The document prints only the first split, because only the first
table has a "dishes" column. The second is what the migration
actually applies to the whole table.

The column is **nullable**, deliberately. A family that is not yet
classified is a real state, and a `NOT NULL` column with an empty
default would hide the difference between "not classified yet" and
"classified as nothing".

---

## What the two vocabularies are

The site has **three** family vocabularies. Only two of them are
in this table.

| Vocabulary | Table | What it is | Used by |
|---|---|---|---|
| **A** | `categories` where `kind='family'` | 77 rows, **1** with published dishes | the `family=` API filter (broken) |
| **B** | `categories` where `kind='dish-type'` | 28 rows, 25 with published dishes | the payload's `familySlug` — what the home dropdown shows |
| **C** | `dish_families` | 306 rows, **123** with published dishes | `/api/atlas/counts`, the `family=` filter's **target** |

This table is **C** (123), merged with **A+B's** orphan map (109).

### The 109 orphans, precisely

The legacy `categories` table holds **152** rows across
4 kinds. **109** of them carry no published dish — every one of
them serves HTTP 200 with a heading and nothing else:

| kind | categories | with published dishes | **empty** |
|---|---|---|---|
| `course-group` | 11 | 0 | **11** |
| `cuisine` | 36 | 17 | **19** |
| `dish-type` | 28 | 25 | **3** |
| `family` | 77 | 1 | **76** |
| **total** | **152** | **43** | **109** |

**The `family` kind is almost entirely empty** — 76 of 77 rows.
That is the reason `family=` returns nothing: the filter reads
vocabulary A, and vocabulary A has one dish in it.

---

## The classification rules

Applied in order; the first match wins. Every family is
classified by an explicit rule, not by eye.

| Priority | Rule | Meaning |
|---|---|---|
| 1 | **Override** | an explicit per-slug decision for the families the tree does not settle |
| 2 | **CUISINE** | a regional culinary tradition — whose kitchen is this from? |
| 3 | **COURSE** | where it sits in a meal — when is it eaten? |
| 4 | **CONTENT TYPE** | the shape of the editorial content, or an umbrella |
| 5 | **FORM** | the physical shape or construction — what is it made of? |
| 6 | **Suffix** | a name ending in a form word (`-dish`, `-soup`, `-cake`…) is a FORM |
| 7 | **Inherit** | a family takes its parent's class unless it has its own |

What each class **means**:

- **FORM** — the physical shape or construction. *soup, bread,
  dumpling, stew, salad, sandwich.*
- **COURSE** — the role in the meal. *dessert, side dish, snack,
  appetizer.*
- **CUISINE** — a regional culinary tradition. *jajan pasar, kue,
  mithai.*
- **CONTENT TYPE** — the shape of the editorial content, or an
  umbrella that classifies by *is this a thing we eat / drink /
  prepare* rather than by form or course. *dish, food, street food,
  cuisine, brand.*

---

## The 123 families

**FORM 83 · COURSE 21 · CUISINE 4 · CONTENT TYPE 15**

| # | class | dishes | family | path |
|---|---|---|---|---|
| 1 | CONTENT TYPE | 397 | **Dish** (`dish`) | dish |
| 2 | COURSE | 96 | **Dessert** (`dessert`) | dessert |
| 3 | FORM | 70 | **Soup** (`soup`) | soup |
| 4 | CONTENT TYPE | 55 | **Food** (`food`) | dish › food |
| 5 | FORM | 45 | **Rice Dish** (`rice-dish`) | rice-dish |
| 6 | COURSE | 38 | **Pastry** (`pastry`) | dessert › pastry |
| 7 | COURSE | 37 | **Confectionery** (`confectionery`) | dessert › confectionery |
| 8 | FORM | 30 | **Bread** (`bread`) | bread |
| 9 | CONTENT TYPE | 28 | **Human Food** (`human-food`) | dish › human-food |
| 10 | FORM | 28 | **Stew** (`stew`) | stew |
| 11 | FORM | 27 | **Potato Dish** (`potato-dish`) | dish › potato-dish |
| 12 | FORM | 27 | **Salad** (`salad`) | salad |
| 13 | FORM | 24 | **Meat Dish** (`meat-dish`) | meat-dish |
| 14 | COURSE | 22 | **Baked Good** (`baked-good`) | dessert › baked-good |
| 15 | FORM | 21 | **Sandwich** (`sandwich`) | sandwich |
| 16 | FORM | 20 | **Fish Dish** (`fish-dish`) | fish-dish |
| 17 | CUISINE | 18 | **Jajan Pasar** (`jajan-pasar`) | dish › jajan-pasar |
| 18 | FORM | 18 | **Chicken Dish** (`chicken-dish`) | meat-dish › chicken-dish |
| 19 | FORM | 15 | **Candy** (`candy`) | dessert › confection › candy |
| 20 | FORM | 15 | **Beef Dish** (`beef-dish`) | meat-dish › beef-dish |
| 21 | FORM | 14 | **Kebab** (`kebab`) | kebab |
| 22 | FORM | 14 | **Pasta Dish** (`pasta-dish`) | pasta-dish |
| 23 | FORM | 12 | **Pork Dish** (`pork-dish`) | meat-dish › pork-dish |
| 24 | COURSE | 11 | **Snack** (`snack`) | dish › snack |
| 25 | FORM | 10 | **Cookie** (`cookie`) | dessert › confection › cookie |
| 26 | FORM | 10 | **Egg Dish** (`egg-dish`) | egg-dish |
| 27 | FORM | 9 | **Cake** (`cake`) | dessert › cake |
| 28 | CUISINE | 9 | **Kue** (`kue`) | dessert › kue |
| 29 | COURSE | 9 | **Sweet Dish** (`sweet-dish`) | dessert › sweet-dish |
| 30 | FORM | 9 | **Lamb Dish** (`lamb-dish`) | meat-dish › lamb-dish |
| 31 | FORM | 9 | **Noodle Dish** (`noodle-dish`) | noodle-soup › noodle-dish |
| 32 | FORM | 9 | **Pancake** (`pancake`) | pancake |
| 33 | FORM | 8 | **Flatbread** (`flatbread`) | bread › flatbread |
| 34 | FORM | 8 | **Casserole** (`casserole`) | casserole |
| 35 | FORM | 8 | **Pudding** (`pudding`) | dessert › pudding |
| 36 | FORM | 8 | **Seafood Dish** (`seafood-dish`) | dish › seafood-dish |
| 37 | FORM | 8 | **Dumpling** (`dumpling`) | dumpling |
| 38 | FORM | 8 | **Pie** (`pie`) | filled-pastry › pie |
| 39 | FORM | 8 | **Goat Meat Dish** (`goat-meat-dish`) | meat-dish › goat-meat-dish |
| 40 | CONTENT TYPE | 8 | **Drink** (`drink`) | side-dish › beverage › drink |
| 41 | FORM | 7 | **Curry** (`curry`) | curry |
| 42 | COURSE | 7 | **Appetizer** (`appetizer`) | dish › appetizer |
| 43 | COURSE | 7 | **Finger Food** (`finger-food`) | dish › appetizer › finger-food |
| 44 | FORM | 7 | **Noodle Soup** (`noodle-soup`) | noodle-soup |
| 45 | FORM | 6 | **Sweet Bread** (`sweet-bread`) | bread › sweet-bread |
| 46 | COURSE | 6 | **Doughnut** (`doughnut`) | dessert › doughnut |
| 47 | COURSE | 6 | **Sweetmeat** (`sweetmeat`) | dessert › sweetmeat |
| 48 | FORM | 6 | **National Dish** (`national-dish`) | dish › national-dish |
| 49 | CONTENT TYPE | 6 | **Street Food** (`street-food`) | dish › street-food |
| 50 | CONTENT TYPE | 6 | **Traditional Food** (`traditional-food`) | dish › traditional-food |
| 51 | FORM | 6 | **Vegetable Dish** (`vegetable-dish`) | dish › vegetable-dish |
| 52 | FORM | 6 | **Pasta** (`pasta`) | pasta |
| 53 | FORM | 6 | **Fish Soup** (`fish-soup`) | soup › fish-soup |
| 54 | COURSE | 5 | **Chewing Gum** (`chewing-gum`) | dessert › confection › chewing-gum |
| 55 | CONTENT TYPE | 5 | **Cuisine** (`cuisine`) | dish › cuisine |
| 56 | CONTENT TYPE | 5 | **Culinary Speciality** (`culinary-speciality`) | dish › culinary-speciality |
| 57 | FORM | 5 | **Fritter** (`fritter`) | fritter |
| 58 | FORM | 5 | **Offal Dish** (`offal-dish`) | meat-dish › offal-dish |
| 59 | FORM | 5 | **Stuffed Pasta** (`stuffed-pasta`) | pasta-dish › stuffed-pasta |
| 60 | COURSE | 5 | **Meze** (`meze`) | side-dish › meze |
| 61 | CUISINE | 4 | **Mithai** (`mithai`) | dessert › confection › mithai |
| 62 | FORM | 4 | **Shrimp Dish** (`shrimp-dish`) | dish › seafood-dish › shrimp-dish |
| 63 | FORM | 4 | **Sauce** (`sauce`) | sauce |
| 64 | CONTENT TYPE | 3 | **Bacon Wrapped Food** (`bacon-wrapped-food`) | dish › bacon-wrapped-food |
| 65 | CONTENT TYPE | 3 | **Fast Food** (`fast-food`) | dish › fast-food |
| 66 | CONTENT TYPE | 3 | **Food Brand** (`food-brand`) | dish › food-brand |
| 67 | FORM | 3 | **Clam Dish** (`clam-dish`) | dish › seafood-dish › clam-dish |
| 68 | FORM | 3 | **Spread** (`spread`) | dish › spread |
| 69 | FORM | 3 | **Tuna Dish** (`tuna-dish`) | fish-dish › tuna-dish |
| 70 | FORM | 3 | **Veal Dish** (`veal-dish`) | meat-dish › veal-dish |
| 71 | FORM | 3 | **Bibimbap** (`bibimbap`) | rice-dish › bibimbap |
| 72 | FORM | 3 | **Rice** (`rice`) | rice-dish › rice |
| 73 | FORM | 2 | **Bun** (`bun`) | bread › bun |
| 74 | FORM | 2 | **Torte** (`torte`) | dessert › cake › torte |
| 75 | COURSE | 2 | **Chocolate Bar** (`chocolate-bar`) | dessert › chocolate-bar |
| 76 | COURSE | 2 | **Frozen Dessert** (`frozen-dessert`) | dessert › frozen-dessert |
| 77 | COURSE | 2 | **Ice Cream Flavour** (`ice-cream-flavour`) | dessert › ice-cream-flavour |
| 78 | COURSE | 2 | **Wafer** (`wafer`) | dessert › wafer |
| 79 | COURSE | 2 | **Wagashi** (`wagashi`) | dessert › wagashi |
| 80 | CONTENT TYPE | 2 | **Brand** (`brand`) | dish › brand |
| 81 | FORM | 2 | **Cooked Grain** (`cooked-grain`) | dish › cooked-grain |
| 82 | FORM | 2 | **Holiday Dish** (`holiday-dish`) | dish › holiday-dish |
| 83 | FORM | 2 | **Christmas Food** (`christmas-food`) | dish › holiday-dish › christmas-food |
| 84 | CONTENT TYPE | 2 | **Meal** (`meal`) | dish › meal |
| 85 | FORM | 2 | **Live Seafood** (`live-seafood`) | dish › seafood-dish › live-seafood |
| 86 | FORM | 2 | **Surimi** (`surimi`) | dish › seafood-dish › surimi |
| 87 | FORM | 2 | **Filled pastry** (`filled-pastry`) | filled-pastry |
| 88 | FORM | 2 | **Meatball** (`meatball`) | kebab › meatball |
| 89 | FORM | 2 | **Instant Noodles** (`instant-noodles`) | noodle-soup › noodle-dish › instant-noodles |
| 90 | FORM | 2 | **Porridge** (`porridge`) | porridge |
| 91 | FORM | 1 | **Brioche** (`brioche`) | bread › brioche |
| 92 | FORM | 1 | **Leavened Bread** (`leavened-bread`) | bread › leavened-bread |
| 93 | FORM | 1 | **White Bread** (`white-bread`) | bread › white-bread |
| 94 | FORM | 1 | **Breaded Cutlet** (`breaded-cutlet`) | breaded-cutlet |
| 95 | FORM | 1 | **Cotoletta** (`cotoletta`) | breaded-cutlet › cotoletta |
| 96 | FORM | 1 | **Apple Turnover** (`apple-turnover`) | dessert › apple-turnover |
| 97 | FORM | 1 | **Ame** (`ame`) | dessert › confection › ame |
| 98 | FORM | 1 | **Brittle** (`brittle`) | dessert › confection › candy › brittle |
| 99 | FORM | 1 | **Chocolate Egg** (`chocolate-egg`) | dessert › confection › chocolate › chocolate-egg |
| 100 | FORM | 1 | **Honey** (`honey`) | dessert › confection › honey |
| 101 | FORM | 1 | **Western Confection** (`western-confection`) | dessert › confection › western-confection |
| 102 | COURSE | 1 | **Cruller** (`cruller`) | dessert › cruller |
| 103 | COURSE | 1 | **Mousse** (`mousse`) | dessert › mousse |
| 104 | FORM | 1 | **Hedgehog Slice** (`hedgehog-slice`) | dessert › pastry › hedgehog-slice |
| 105 | COURSE | 1 | **Shaved Ice** (`shaved-ice`) | dessert › shaved-ice |
| 106 | COURSE | 1 | **Shiroi Koibito** (`shiroi-koibito`) | dessert › shiroi-koibito |
| 107 | CUISINE | 1 | **Chadian Cuisine** (`chadian-cuisine`) | dish › chadian-cuisine |
| 108 | CONTENT TYPE | 1 | **Cold Dish** (`cold-dish`) | dish › cold-dish |
| 109 | CONTENT TYPE | 1 | **Course** (`course`) | dish › course |
| 110 | FORM | 1 | **Sweet Potato Dish** (`sweet-potato-dish`) | dish › sweet-potato-dish |
| 111 | FORM | 1 | **Scrambled Eggs** (`scrambled-eggs`) | egg-dish › scrambled-eggs |
| 112 | FORM | 1 | **Fermented Bean Paste** (`fermented-bean-paste`) | fermented-dish › fermented-soy › fermented-bean-paste |
| 113 | FORM | 1 | **Savoury Pie** (`savoury-pie`) | filled-pastry › pie › savoury-pie |
| 114 | FORM | 1 | **Fried Rice** (`fried-rice`) | fried-rice |
| 115 | FORM | 1 | **Cold Noodle** (`cold-noodle`) | noodle-soup › noodle-dish › cold-noodle |
| 116 | FORM | 1 | **Buckwheat Pancake** (`buckwheat-pancake`) | pancake › buckwheat-pancake |
| 117 | FORM | 1 | **Idli** (`idli`) | rice-dish › idli |
| 118 | FORM | 1 | **Patty** (`patty`) | sandwich › burger › patty |
| 119 | FORM | 1 | **Fish Sauce** (`fish-sauce`) | sauce › fish-sauce |
| 120 | FORM | 1 | **Tripe Soup** (`tripe-soup`) | soup › tripe-soup |
| 121 | FORM | 1 | **Goulash** (`goulash`) | stew › goulash |
| 122 | FORM | 1 | **Stuffed Pepper** (`stuffed-pepper`) | stuffed-vegetable › stuffed-pepper |
| 123 | FORM | 1 | **Taco** (`taco`) | taco |

---

## The 109 orphans — the legacy map

These are the `categories` rows with no published dish. They are
the pages that currently return 200 with nothing on them.

### By kind

| kind | empty | of | what they are |
|---|---|---|---|
| `family` | 76 | 77 | the legacy 'family' vocabulary — 1 live |
| `course-group` | 11 | 11 | **entirely** empty |
| `cuisine` | 19 | 36 | legacy cuisine tags |
| `dish-type` | 3 | 28 | legacy dish-type tags |
| **total** | **109** | **152** | |

### Every orphan

| kind | category | published dishes |
|---|---|---|
| `course-group` | Breads & doughs (`breads-doughs`) | 0 |
| `course-group` | Drinks (`drinks`) | 0 |
| `course-group` | Mains (`mains`) | 0 |
| `course-group` | Noodles & pasta (`noodles-pasta`) | 0 |
| `course-group` | Preserves & condiments (`preserves-condiments`) | 0 |
| `course-group` | Rice & grains (`rice-grains`) | 0 |
| `course-group` | Small plates & sides (`small-plates-sides`) | 0 |
| `course-group` | Soups & broths (`soups-broths`) | 0 |
| `course-group` | Street foods & snacks (`street-foods-snacks`) | 0 |
| `course-group` | Sweets & desserts (`sweets-desserts`) | 0 |
| `course-group` | Techniques & bases (`techniques-bases`) | 0 |
| `cuisine` | American cuisine (`american-cuisine`) | 0 |
| `cuisine` | Austrian cuisine (`austrian-cuisine`) | 0 |
| `cuisine` | Bahian cuisine (`bahian-cuisine`) | 0 |
| `cuisine` | Brazilian cuisine (`brazilian-cuisine`) | 0 |
| `cuisine` | British cuisine (`british-cuisine`) | 0 |
| `cuisine` | Canadian cuisine (`canadian-cuisine`) | 0 |
| `cuisine` | Caribbean cuisine (`caribbean-cuisine`) | 0 |
| `cuisine` | Goan cuisine (`goan-cuisine`) | 0 |
| `cuisine` | Greek cuisine (`greek-cuisine`) | 0 |
| `cuisine` | Hungarian cuisine (`hungarian-cuisine`) | 0 |
| `cuisine` | Jordanian cuisine (`jordanian-cuisine`) | 0 |
| `cuisine` | Maghrebi cuisine (`maghrebi-cuisine`) | 0 |
| `cuisine` | Moroccan cuisine (`moroccan-cuisine`) | 0 |
| `cuisine` | Nepali cuisine (`nepali-cuisine`) | 0 |
| `cuisine` | Nigerian cuisine (`nigerian-cuisine`) | 0 |
| `cuisine` | Northern Thai cuisine (`northern-thai-cuisine`) | 0 |
| `cuisine` | Polish cuisine (`polish-cuisine`) | 0 |
| `cuisine` | Portuguese cuisine (`portuguese-cuisine`) | 0 |
| `cuisine` | Ukrainian cuisine (`ukrainian-cuisine`) | 0 |
| `dish-type` | Fermented dish (`fermented`) | 0 |
| `dish-type` | Moussaka (`moussaka`) | 0 |
| `dish-type` | Side dish (`side`) | 0 |
| `family` | Aromatic bases (`aromatic-bases`) | 0 |
| `family` | Barbecue & smoked foods (`barbecue-smoked-foods`) | 0 |
| `family` | Batters & coatings (`batters-coatings`) | 0 |
| `family` | Cakes & sponges (`cakes-sponges`) | 0 |
| `family` | Casseroles & baked layers (`casseroles-baked-layers`) | 0 |
| `family` | Cheeses & cultured dairy (`cheeses-cultured-dairy`) | 0 |
| `family` | Chili sauces & fermented pastes (`chili-sauces-fermented-pastes`) | 0 |
| `family` | Coffee traditions (`coffee-traditions`) | 0 |
| `family` | Cold drinks & refreshers (`cold-drinks-refreshers`) | 0 |
| `family` | Cold soups (`cold-soups`) | 0 |
| `family` | Confections & candies (`confections-candies`) | 0 |
| `family` | Cookies & biscuits (`cookies-biscuits`) | 0 |
| `family` | Cured meats (`cured-meats`) | 0 |
| `family` | Curries & spiced sauces (`curries-spiced-sauces`) | 0 |
| `family` | Custards & puddings (`custards-puddings`) | 0 |
| `family` | Dips & spreads (`dips-spreads`) | 0 |
| `family` | Dry & tossed noodles (`dry-tossed-noodles`) | 0 |
| `family` | Dumplings (`dumplings`) | 0 |
| `family` | Egg dishes (`egg-dishes`) | 0 |
| `family` | Enriched breads (`enriched-breads`) | 0 |
| `family` | Fermentation starters (`fermentation-starters`) | 0 |
| `family` | Fermented drinks (`fermented-drinks`) | 0 |
| `family` | Fermented mains (`fermented-mains`) | 0 |
| `family` | Filled breads (`filled-breads`) | 0 |
| `family` | Flatbreads (`flatbreads`) | 0 |
| `family` | Fresh noodles & pasta (`fresh-noodles-pasta`) | 0 |
| `family` | Fried breads (`fried-breads`) | 0 |
| `family` | Fried sweets (`fried-sweets`) | 0 |
| `family` | Fritters & croquettes (`fritters-croquettes`) | 0 |
| `family` | Frozen desserts (`frozen-desserts`) | 0 |
| `family` | Fruit desserts (`fruit-desserts`) | 0 |
| `family` | Grilled & skewered (`grilled-skewered`) | 0 |
| `family` | Hand pies & turnovers (`hand-pies-turnovers`) | 0 |
| `family` | Herbal & tonic drinks (`herbal-tonic-drinks`) | 0 |
| `family` | Hot brews & spiced drinks (`hot-brews-spiced-drinks`) | 0 |
| `family` | Hot pots & communal simmer (`hot-pots-communal-simmer`) | 0 |
| `family` | Laminated breads & pastries (`laminated-breads-pastries`) | 0 |
| `family` | Laminated & layered pastries (`laminated-layered-pastries`) | 0 |
| `family` | Leaf-wrapped & steamed foods (`leaf-wrapped-steamed-foods`) | 0 |
| `family` | Leavened loaves (`leavened-loaves`) | 0 |
| `family` | Legume dishes (`legume-dishes`) | 0 |
| `family` | Marinades & rubs (`marinades-rubs`) | 0 |
| `family` | Meatballs & koftas (`meatballs-koftas`) | 0 |
| `family` | Milk sweets (`milk-sweets`) | 0 |
| `family` | Noodle soups (`noodle-soups`) | 0 |
| `family` | Nut & seed sauces/pastes (`nut-seed-sauces-pastes`) | 0 |
| `family` | Offal & nose-to-tail dishes (`offal-nose-to-tail`) | 0 |
| `family` | Pâtés & terrines (`pates-terrines`) | 0 |
| `family` | Pickles & ferments (`pickles-ferments`) | 0 |
| `family` | Pilafs & seasoned rice (`pilafs-seasoned-rice`) | 0 |
| `family` | Porridges & congees (`porridges-congees`) | 0 |
| `family` | Raw & cured fish (`raw-cured-fish`) | 0 |
| `family` | Relishes & chutneys (`relishes-chutneys`) | 0 |
| `family` | Rice bowls (`rice-bowls`) | 0 |
| `family` | Rice cakes & compressed rice (`rice-cakes-compressed-rice`) | 0 |
| `family` | Rice & sticky rice sweets (`rice-sticky-rice-sweets`) | 0 |
| `family` | Roasts & whole cooked meats (`roasts-whole-cooked-meats`) | 0 |
| `family` | Salads & slaws (`salads-slaws`) | 0 |
| `family` | Sandwiches & stuffed breads (`sandwiches-stuffed-breads`) | 0 |
| `family` | Sausages & encased meats (`sausages-encased-meats`) | 0 |
| `family` | Savory pancakes & griddled batters (`savory-pancakes-griddled-batters`) | 0 |
| `family` | Savory pies & pastries (`savory-pies-pastries`) | 0 |
| `family` | Seafood stews & braises (`seafood-stews-braises`) | 0 |
| `family` | Soups & broths (`soups-broths-family`) | 0 |
| `family` | Spice pastes & cooking bases (`spice-pastes-cooking-bases`) | 0 |
| `family` | Steamed buns (`steamed-buns`) | 0 |
| `family` | Stews & braises (`stews-braises`) | 0 |
| `family` | Stir-fries (`stir-fries`) | 0 |
| `family` | Stocks & broth bases (`stocks-broths-bases`) | 0 |
| `family` | Street snacks (`street-snacks`) | 0 |
| `family` | Stuffed vegetables (`stuffed-vegetables`) | 0 |
| `family` | Tea traditions (`tea-traditions`) | 0 |
| `family` | Tortilla & masa dishes (`tortilla-masa-dishes`) | 0 |
| `family` | Vegetable sides (`vegetable-sides`) | 0 |
| `family` | Wok-fried rice noodles (`wok-fried-rice-noodles`) | 0 |
| `family` | Wraps & rolls (`wraps-rolls`) | 0 |

---

## What happens to them

The user's decision: **legacy categories are retired in P3.** So:

- The 109 orphans get **no** page in the new taxonomy. A family
  page is built from `dish_families` (vocabulary C), and these
  rows are not in it.
- Their URLs are the **301** candidates: any `/family/<slug>` that
  currently resolves to one of these must 301 to the right
  `dish_families` page, or to `/families` if there is none.
- The 43 live legacy categories are the harder half — they need a
  mapping to a `dish_families` value, and that mapping is the
  **P3** work.

---

## What this table does NOT decide

- ~~**Whether the classification is applied to the schema.**~~ —
  **settled 2026-11-06: it is applied.** `dish_families.family_class`
  holds the class for all 306 families, and the CHECK constraint
  enforces the four values. See
  `db/migrations/0051_family_classification.sql`.
- **The `dish_families` → `categories` mapping** for the 43 live
  legacy categories.
- **The 183 `dish_families` with no published dishes** (they are
  listed in the appendix). They are the draft-side vocabulary:
  real, classified, but not yet carrying anything public.

---

## Appendix — the 183 families with no published dish

Classified the same way. These are real families in the tree, but
nothing published hangs off them yet.

| class | family | path |
|---|---|---|
| CONTENT TYPE | Sanquette (`sanquette`) | dish › sanquette |
| CONTENT TYPE | Semolina (`semolina`) | dish › semolina |
| CONTENT TYPE | Fermented Dish (`fermented-dish`) | fermented-dish |
| CONTENT TYPE | Cured Fish (`cured-fish`) | fermented-dish › cured-fish |
| CONTENT TYPE | Cured Meat (`cured-meat`) | fermented-dish › cured-meat |
| CONTENT TYPE | Bacon (`bacon`) | fermented-dish › cured-meat › bacon |
| CONTENT TYPE | Ham (`ham`) | fermented-dish › cured-meat › ham |
| CONTENT TYPE | Prosciutto (`prosciutto`) | fermented-dish › cured-meat › prosciutto |
| CONTENT TYPE | Dried Meat (`dried-meat`) | fermented-dish › dried-meat |
| CONTENT TYPE | Fermented Soy (`fermented-soy`) | fermented-dish › fermented-soy |
| CONTENT TYPE | Marmite (`marmite`) | fermented-dish › fermented-soy › marmite |
| CONTENT TYPE | Miso (`miso`) | fermented-dish › fermented-soy › miso |
| CONTENT TYPE | Natto (`natto`) | fermented-dish › fermented-soy › natto |
| CONTENT TYPE | Tempeh (`tempeh`) | fermented-dish › fermented-soy › tempeh |
| CONTENT TYPE | Fermented Vegetable (`fermented-vegetable`) | fermented-dish › fermented-vegetable |
| CONTENT TYPE | Kimchi (`kimchi`) | fermented-dish › fermented-vegetable › kimchi |
| CONTENT TYPE | Sauerkraut (`sauerkraut`) | fermented-dish › fermented-vegetable › sauerkraut |
| CONTENT TYPE | Preserved Vegetable (`preserved-vegetable`) | fermented-dish › preserved-vegetable |
| CONTENT TYPE | Shiokara (`shiokara`) | fermented-dish › shiokara |
| CONTENT TYPE | Moussaka (`moussaka`) | moussaka |
| CONTENT TYPE | Pizza (`pizza`) | pizza |
| CONTENT TYPE | Beverage (`beverage`) | side-dish › beverage |
| CONTENT TYPE | Aguas Frescas (`aguas-frescas`) | side-dish › beverage › aguas-frescas |
| CONTENT TYPE | Alcoholic Drink (`alcoholic-drink`) | side-dish › beverage › alcoholic-drink |
| CONTENT TYPE | Beer (`beer`) | side-dish › beverage › alcoholic-drink › beer |
| CONTENT TYPE | Cider (`cider`) | side-dish › beverage › alcoholic-drink › cider |
| CONTENT TYPE | Cocktail (`cocktail`) | side-dish › beverage › alcoholic-drink › cocktail |
| CONTENT TYPE | Sake (`sake`) | side-dish › beverage › alcoholic-drink › sake |
| CONTENT TYPE | Spirit (`spirit`) | side-dish › beverage › alcoholic-drink › spirit |
| CONTENT TYPE | Baijiu (`baijiu`) | side-dish › beverage › alcoholic-drink › spirit › baijiu |
| CONTENT TYPE | Brandy (`brandy`) | side-dish › beverage › alcoholic-drink › spirit › brandy |
| CONTENT TYPE | Mezcal (`mezcal`) | side-dish › beverage › alcoholic-drink › spirit › mezcal |
| CONTENT TYPE | Rum (`rum`) | side-dish › beverage › alcoholic-drink › spirit › rum |
| CONTENT TYPE | Soju (`soju`) | side-dish › beverage › alcoholic-drink › spirit › soju |
| CONTENT TYPE | Tequila (`tequila`) | side-dish › beverage › alcoholic-drink › spirit › tequila |
| CONTENT TYPE | Wine (`wine`) | side-dish › beverage › alcoholic-drink › wine |
| CONTENT TYPE | Bubble Tea (`bubbletea`) | side-dish › beverage › bubbletea |
| CONTENT TYPE | Coffee (`coffee`) | side-dish › beverage › coffee |
| CONTENT TYPE | Fermented Drink (`fermented-drink`) | side-dish › beverage › fermented-drink |
| CONTENT TYPE | Ayran (`ayran`) | side-dish › beverage › fermented-drink › ayran |
| CONTENT TYPE | Kefir (`kefir`) | side-dish › beverage › fermented-drink › kefir |
| CONTENT TYPE | Kombucha (`kombucha`) | side-dish › beverage › fermented-drink › kombucha |
| CONTENT TYPE | Lassi (`lassi`) | side-dish › beverage › fermented-drink › lassi |
| CONTENT TYPE | Horchata (`horchata`) | side-dish › beverage › horchata |
| CONTENT TYPE | Juice (`juice`) | side-dish › beverage › juice |
| CONTENT TYPE | Lemonade (`lemonade`) | side-dish › beverage › lemonade |
| CONTENT TYPE | Shake (`shake`) | side-dish › beverage › shake |
| CONTENT TYPE | Smoothie (`smoothie`) | side-dish › beverage › smoothie |
| CONTENT TYPE | Tea (`tea`) | side-dish › beverage › tea |
| CONTENT TYPE | Stuffed vegetable (`stuffed-vegetable`) | stuffed-vegetable |
| CONTENT TYPE | Fried Vegetable (`fried-vegetable`) | stuffed-vegetable › fried-vegetable |
| CONTENT TYPE | Grilled Vegetable (`grilled-vegetable`) | stuffed-vegetable › grilled-vegetable |
| CONTENT TYPE | Leafy Green (`leafy-green`) | stuffed-vegetable › leafy-green |
| CONTENT TYPE | Pickled Vegetable (`pickled-vegetable`) | stuffed-vegetable › pickled-vegetable |
| CONTENT TYPE | Roasted Vegetable (`roasted-vegetable`) | stuffed-vegetable › roasted-vegetable |
| COURSE | Cendol (`cendol`) | dessert › cendol |
| COURSE | Cheesecake (`cheesecake`) | dessert › cheesecake |
| COURSE | Confection (`confection`) | dessert › confection |
| COURSE | Baklava (`baklava`) | dessert › confection › baklava |
| COURSE | Cannoli (`cannoli`) | dessert › confection › cannoli |
| COURSE | Caramel (`caramel`) | dessert › confection › caramel |
| COURSE | Chocolate (`chocolate`) | dessert › confection › chocolate |
| COURSE | Drops (`drops`) | dessert › confection › drops |
| COURSE | Meringue (`meringue`) | dessert › confection › meringue |
| COURSE | Crumble (`crumble`) | dessert › crumble |
| COURSE | Dessert Buffet (`dessert-buffet`) | dessert › dessert-buffet |
| COURSE | Jelly Doughnut (`jelly-doughnut`) | dessert › doughnut › jelly-doughnut |
| COURSE | Gelato (`gelato`) | dessert › frozen-dessert › gelato |
| COURSE | Ice Cream (`ice-cream`) | dessert › frozen-dessert › ice-cream |
| COURSE | Indian Sweet (`indian-sweet`) | dessert › indian-sweet |
| COURSE | Barfi (`barfi`) | dessert › indian-sweet › barfi |
| COURSE | Halwa (`halwa`) | dessert › indian-sweet › halwa |
| COURSE | Jalebi (`jalebi`) | dessert › indian-sweet › jalebi |
| COURSE | Kulfi (`kulfi`) | dessert › indian-sweet › kulfi |
| COURSE | Laddu (`laddu`) | dessert › indian-sweet › laddu |
| COURSE | Manjar Blanco (`manjar-blanco`) | dessert › manjar-blanco |
| COURSE | Manju (`manju`) | dessert › manju |
| COURSE | Matcha Dessert (`matcha-dessert`) | dessert › matcha-dessert |
| COURSE | Mochi (`mochi`) | dessert › mochi |
| COURSE | Panna Cotta (`panna-cotta`) | dessert › panna-cotta |
| COURSE | Tiramisu (`tiramisu`) | dessert › tiramisu |
| COURSE | Trifle (`trifle`) | dessert › trifle |
| COURSE | Breakfast (`breakfast`) | dish › meal › breakfast |
| COURSE | Side Dish (`side-dish`) | side-dish |
| COURSE | Banchan (`banchan`) | side-dish › banchan |
| COURSE | Chips (`chips`) | side-dish › chips |
| COURSE | Chips Fry (`chips-fry`) | side-dish › chips-fry |
| COURSE | French Fries (`french-fries`) | side-dish › french-fries |
| COURSE | Nasi Campur (`nasi-campur`) | side-dish › nasi-campur |
| COURSE | Rijsttafel (`rijsttafel`) | side-dish › rijsttafel |
| COURSE | Tempura Fries (`tempura-fries`) | side-dish › tempura-fries |
| COURSE | Thali (`thali`) | side-dish › thali |
| COURSE | Street Snack (`street-snack`) | street-snack |
| CUISINE | Kueh (`kueh`) | dessert › kueh |
| FORM | Baked Bread (`baked-bread`) | bread › baked-bread |
| FORM | Naan (`naan`) | bread › naan |
| FORM | Pita (`pita`) | bread › pita |
| FORM | Tortilla (`tortilla`) | bread › tortilla |
| FORM | Croquette (`croquette`) | breaded-cutlet › croquette |
| FORM | Potato Casserole (`potato-casserole`) | casserole › potato-casserole |
| FORM | Steamed Fish (`steamed-fish`) | casserole › steamed-fish |
| FORM | Biscuit (`biscuit`) | dessert › biscuit |
| FORM | Crepe Cake (`crepe-cake`) | dessert › crepe-cake |
| FORM | Custard (`custard`) | dessert › custard |
| FORM | Sorbet (`sorbet`) | dessert › frozen-dessert › sorbet |
| FORM | Souffle (`souffle`) | dessert › souffle |
| FORM | Sweet Custard (`sweet-custard`) | dessert › sweet-custard |
| FORM | Sweet Pie (`sweet-pie`) | dessert › sweet-pie |
| FORM | Sweet Pudding (`sweet-pudding`) | dessert › sweet-pudding |
| FORM | Sweet Tart (`sweet-tart`) | dessert › sweet-tart |
| FORM | Peanut Butter (`peanut-butter`) | dish › spread › peanut-butter |
| FORM | Steamed Bread (`steamed-bread`) | dish › steamed-bread |
| FORM | Baozi (`baozi`) | dish › steamed-bread › baozi |
| FORM | Legume (`legume`) | dish › vegetable-dish › legume |
| FORM | Omelette (`omelette`) | egg-dish › omelette |
| FORM | Egg Tart (`egg-tart`) | filled-pastry › egg-tart |
| FORM | Tart (`tart`) | filled-pastry › tart |
| FORM | Falafel (`falafel`) | fritter › falafel |
| FORM | Fried Chicken (`fried-chicken`) | fritter › fried-chicken |
| FORM | Fried Fish (`fried-fish`) | fritter › fried-fish |
| FORM | Samosa (`samosa`) | fritter › samosa |
| FORM | Tempura (`tempura`) | fritter › tempura |
| FORM | Barbecue (`barbecue`) | kebab › barbecue |
| FORM | Grilled Fish (`grilled-fish`) | kebab › grilled-fish |
| FORM | Grilled Meat (`grilled-meat`) | kebab › grilled-meat |
| FORM | Roast Chicken (`roast-chicken`) | kebab › roast-chicken |
| FORM | Roast Meat (`roast-meat`) | kebab › roast-meat |
| FORM | Satay (`satay`) | kebab › satay |
| FORM | Sausage (`sausage`) | kebab › sausage |
| FORM | Shashlik (`shashlik`) | kebab › shashlik |
| FORM | Shellfish (`shellfish`) | kebab › shellfish |
| FORM | Skewer (`skewer`) | kebab › skewer |
| FORM | Laksa (`laksa`) | noodle-soup › laksa |
| FORM | Janchi Guksu (`janchi-guksu`) | noodle-soup › noodle-dish › cold-noodle › janchi-guksu |
| FORM | Pho (`pho`) | noodle-soup › pho |
| FORM | Ramen (`ramen`) | noodle-soup › ramen |
| FORM | Rice Noodle (`rice-noodle`) | noodle-soup › rice-noodle |
| FORM | Crepe (`crepe`) | pancake › crepe |
| FORM | Sweet Crepe (`sweet-crepe`) | pancake › sweet-crepe |
| FORM | Waffle (`waffle`) | pancake › waffle |
| FORM | Dough (`dough`) | pasta › dough |
| FORM | Couscous (`couscous`) | porridge › couscous |
| FORM | Granola (`granola`) | porridge › granola |
| FORM | Muesli (`muesli`) | porridge › muesli |
| FORM | Polenta (`polenta`) | porridge › polenta |
| FORM | Been Cin (`been-cin`) | rice-dish › been-cin |
| FORM | Biryani (`biryani`) | rice-dish › biryani |
| FORM | Congee (`congee`) | rice-dish › congee |
| FORM | Pilaf (`pilaf`) | rice-dish › pilaf |
| FORM | Pulao (`pulao`) | rice-dish › pulao |
| FORM | Rice Balls (`rice-balls`) | rice-dish › rice-balls |
| FORM | Risotto (`risotto`) | rice-dish › risotto |
| FORM | Sticky Rice (`sticky-rice`) | rice-dish › sticky-rice |
| FORM | Raw Fish (`raw-fish`) | salad › raw-fish |
| FORM | Burger (`burger`) | sandwich › burger |
| FORM | Fish Sandwich (`fish-sandwich`) | sandwich › fish-sandwich |
| FORM | Hamburger (`hamburger`) | sandwich › hamburger |
| FORM | Hot Dog (`hot-dog`) | sandwich › hot-dog |
| FORM | Open-faced Sandwich (`open-faced-sandwich`) | sandwich › open-faced-sandwich |
| FORM | Panini (`panini`) | sandwich › panini |
| FORM | Pickle (`pickle`) | side-dish › pickle |
| FORM | Bisque (`bisque`) | soup › bisque |
| FORM | Bouillon (`bouillon`) | soup › bouillon |
| FORM | Broth (`broth`) | soup › broth |
| FORM | Chinese Hot Pot (`chinese-hot-pot`) | soup › chinese-hot-pot |
| FORM | Chowder (`chowder`) | soup › chowder |
| FORM | Fondue (`fondue`) | soup › fondue |
| FORM | Hot Pot (`hot-pot`) | soup › hot-pot |
| FORM | Minestrone (`minestrone`) | soup › minestrone |
| FORM | Braised Meat (`braised-meat`) | stew › braised-meat |
| FORM | Braised Poultry (`braised-poultry`) | stew › braised-poultry |
| FORM | Budae-jjigae (`budae-jjigae`) | stew › budae-jjigae |
| FORM | Chili (`chili`) | stew › chili |
| FORM | Potjiekos (`potjiekos`) | stew › potjiekos |
| FORM | Shakshuka (`shakshuka`) | stew › shakshuka |
| FORM | Stiff porridge (`stiff-porridge`) | stiff-porridge |
| FORM | Stuffed Pastry (`stuffed-pastry`) | stuffed-pastry |
| FORM | Legume Dish (`legume-dish`) | stuffed-vegetable › legume-dish |
| FORM | Mushroom Dish (`mushroom-dish`) | stuffed-vegetable › mushroom-dish |
| FORM | Tofu Dish (`tofu-dish`) | stuffed-vegetable › tofu-dish |
| FORM | Burrito (`burrito`) | taco › burrito |
| FORM | Quesadilla (`quesadilla`) | taco › quesadilla |
| FORM | Wrap (`wrap`) | taco › wrap |
