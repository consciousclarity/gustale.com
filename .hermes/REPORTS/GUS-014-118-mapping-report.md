# GUS-014 — 118-dish dimension mapping report

**Status:** 🟡 **DRY-RUN REPORT — for Alejandro's review. NOTHING WRITTEN TO THE LIVE DATABASE.**

**Source:** `gustale` · **Dishes in scope:** 118 (the 3 pilot dishes are excluded — already mapped) · **Old categories in use:** 43

**Rules applied (Alejandro, 2026-10-26):**

- **No vocabulary extension during the run.** A value not already in the controlled vocabulary goes to the **proposals** list; the cell is left unset for it.
- **Ambiguous or disputed → unset**, and reported.
- **Dimensions only.** No relations, no descriptions, no claims.

---

## 1. Coverage summary

| dimension | dishes with ≥1 value | dishes unset |
|---|---|---|
| `dish_family` | 75 | 43 |
| `dish_cuisine` | 100 | 18 |
| `dish_course` | 112 | 6 |
| `dish_technique` | 109 | 9 |
| `ingredient_category` | 0 | 118 |
| `dish_tradition` | 0 | 118 |
| `dish_context` | 10 | 108 |

- dishes mapped: **118**
- ambiguous cells (multi-valued old data in a single-valued dimension): **4**
- old-category uses with no mapping rule: **0**
- values that would need a vocabulary extension: **0**

## 2. Unmappable old categories

_None._

### Data gaps — dimensions with no signal in the old data

| dimension | why it is empty |
|---|---|
| `dish_tradition` | `dish_tags` is **empty** (0 rows) and `tags` is empty (0 rows). There is **no tradition signal anywhere** in the old data. Tradition cannot be derived from a dish name — doing so would invent cultural claims. All 118 stay unset. |
| `ingredient_category` | `dish_ingredients` has only **4 rows** across the whole catalog (tomato, béchamel sauce, lamb minced, eggplant) covering 3 dishes. There is effectively no ingredient signal. All 118 stay unset. |
| `dish_context` | The old `categories` table has no context dimension. Only `Street snack` (11 dishes) maps to `street-food`. The remaining 108 dishes have no context signal and stay unset — context is a judgement about where a dish is eaten, not a fact recoverable from the old taxonomy. |

## 3. Vocabulary proposals (NOT written)

_None — every mapped value is already in the controlled vocabulary._

## 4. Resolved ties (the generic fallback losing to a specific value)

The old `categories` table mixes a **generic fallback** with **specific** values. `Main course` is the generic fallback — 97 of 122 dishes carry it, and 22 of those also carry a more specific course (Soup, Appetizer, …). Those are **not** ambiguous: per D3f `dish_course` is the dish's *primary meal role*, so the specific value wins and the generic one is dropped.

| dish | dimension | resolution |
|---|---|---|
| `bakso` | `dish_course` | 'main-course' is the generic fallback; the specific value wins |
| `borscht` | `dish_course` | 'main-course' is the generic fallback; the specific value wins |
| `bubur-ayam` | `dish_course` | 'main-course' is the generic fallback; the specific value wins |
| `ceviche-peruvian` | `dish_course` | 'main-course' is the generic fallback; the specific value wins |
| `chole-bhature` | `dish_family` | multiple candidate values: bread, curry |
| `congee` | `dish_course` | 'main-course' is the generic fallback; the specific value wins |
| `dolma` | `dish_course` | 'main-course' is the generic fallback; the specific value wins |
| `doner-kebab` | `dish_family` | a serving form (sandwich) and a family (kebab) both present - needs a decision |
| `empanada` | `dish_course` | 'main-course' is the generic fallback; the specific value wins |
| `falafel` | `dish_course` | 'main-course' is the generic fallback; the specific value wins |
| `gazpacho` | `dish_course` | two specific courses compete at the same priority: soup, appetizer |
| `goulash-hungarian` | `dish_course` | 'main-course' is the generic fallback; the specific value wins |
| `humita` | `dish_course` | 'main-course' is the generic fallback; the specific value wins |
| `khao-soi` | `dish_family` | multiple candidate values: curry, noodle-soup |
| `kibbeh` | `dish_course` | 'main-course' is the generic fallback; the specific value wins |
| `kimchi-jjigae` | `dish_course` | 'main-course' is the generic fallback; the specific value wins |
| `laksa` | `dish_course` | 'main-course' is the generic fallback; the specific value wins |
| `pempek` | `dish_course` | 'main-course' is the generic fallback; the specific value wins |
| `rawon` | `dish_course` | 'main-course' is the generic fallback; the specific value wins |
| `sinigang` | `dish_course` | 'main-course' is the generic fallback; the specific value wins |
| `soto-ayam` | `dish_course` | 'main-course' is the generic fallback; the specific value wins |
| `tamales` | `dish_course` | 'main-course' is the generic fallback; the specific value wins |
| `tempura` | `dish_course` | 'main-course' is the generic fallback; the specific value wins |
| `tom-yum` | `dish_course` | 'main-course' is the generic fallback; the specific value wins |

## 5. Ambiguous cells (left unset, need a decision)

### `dish_family` — single-valued, but the old data gave more than one value

| dish | candidate values (old categories) | why it is ambiguous |
|---|---|---|
| `chole-bhature` | bread, curry | multiple candidate values: bread, curry |
| `doner-kebab` | kebab, sandwich | a serving form (sandwich) and a family (kebab) both present - needs a decision |
| `khao-soi` | curry, noodle-soup | multiple candidate values: curry, noodle-soup |

### `dish_course` — single-valued, but the old data gave more than one value

| dish | candidate values (old categories) | why it is ambiguous |
|---|---|---|
| `gazpacho` | appetizer, soup | two specific courses compete at the same priority: soup, appetizer |


## 5b. Families inferable from the dish's own name (PROPOSALS, not written)

**43 dishes carry no family-ish old category.** Most are self-describing: the dish's canonical name *is* the family name ('Sushi' -> sushi, 'Ceviche' -> ceviche, 'Asado' -> asado, 'Empanada' -> empanada, 'Falafel' -> falafel).

**But the families those dishes would need are NOT in the controlled vocabulary.** Adding them would be a vocabulary extension, which is forbidden during the run. So they are **left unset** and listed here as proposals for a separate, explicit vocabulary decision.

_No proposal could be formed even from the name - every candidate family is outside the vocabulary._

| dish | canonical name | old categories |
|---|---|---|
| `acaraje` | Acarajé | `Appetizer`, `Street snack` |
| `asado` | Asado | `Argentine cuisine`, `Main course` |
| `bakso` | Bakso | `Indonesian cuisine`, `Main course`, `Soup` |
| `borscht` | Borscht | `Main course`, `Soup` |
| `bubur-ayam` | Bubur ayam | `Indonesian cuisine`, `Main course`, `Soup` |
| `ceviche-peruvian` | Ceviche | `Appetizer`, `Main course`, `Peruvian cuisine` |
| `char-siu` | Char siu | `Chinese cuisine`, `Main course` |
| `chiles-en-nogada` | Chiles en nogada | `Main course`, `Mexican cuisine` |
| `chole-bhature` | Chole bhature | `Bread`, `Curry`, `Indian cuisine`, `Main course` |
| `chow-mein` | Chow mein | `Chinese cuisine`, `Main course`, `Stir-fry` |
| `congee` | Congee | `Chinese cuisine`, `Main course`, `Soup` |
| `dolma` | Dolma | `Appetizer`, `Main course`, `Turkish cuisine` |
| `doner-kebab` | Döner kebab | `Kebab`, `Main course`, `Sandwich`, `Turkish cuisine` |
| `empanada` | Empanada | `Appetizer`, `Argentine cuisine`, `Main course` |
| `falafel` | Falafel | `Appetizer`, `Israeli cuisine`, `Main course` |
| `gazpacho` | Gazpacho | `Appetizer`, `Soup`, `Spanish cuisine` |
| `halo-halo` | Halo-halo | `Dessert`, `Filipino cuisine` |
| `humita` | Humita | `Appetizer`, `Argentine cuisine`, `Main course` |
| `ikan-bakar` | Ikan bakar | `Indonesian cuisine`, `Main course` |
| `khao-soi` | Khao Soi | `Curry`, `Main course`, `Noodle soup` |
| `kibbeh` | Kibbeh | `Appetizer`, `Lebanese cuisine`, `Main course` |
| `kung-pao-chicken` | Kung Pao chicken | `Chinese cuisine`, `Main course`, `Stir-fry` |
| `lechon` | Lechon | `Filipino cuisine`, `Main course` |
| `lomo-saltado` | Lomo saltado | `Main course`, `Peruvian cuisine`, `Stir-fry` |
| `menemen` | Menemen | `Main course`, `Turkish cuisine` |
| `peking-duck` | Peking duck | `Chinese cuisine`, `Main course` |
| `pempek` | Pempek | `Appetizer`, `Indonesian cuisine`, `Main course` |
| `poutine` | Poutine | `Main course`, `Street snack` |
| `rawon` | Rawon | `Indonesian cuisine`, `Main course`, `Soup` |
| `samosa` | Samosa | `Appetizer`, `Indian cuisine`, `Street snack` |
| `shakshuka` | Shakshuka | `Israeli cuisine`, `Main course` |
| `sinigang` | Sinigang | `Filipino cuisine`, `Main course`, `Soup` |
| `soto-ayam` | Soto Ayam | `Indonesian cuisine`, `Main course`, `Soup` |
| `sushi` | Sushi | `Japanese cuisine`, `Main course` |
| `takoyaki` | Takoyaki | `Appetizer`, `Japanese cuisine`, `Street snack` |
| `tamales` | Tamales | `Appetizer`, `Main course`, `Mexican cuisine` |
| `tarte-tatin` | Tarte Tatin | `Dessert`, `French cuisine` |
| `tempura` | Tempura | `Appetizer`, `Japanese cuisine`, `Main course` |
| `tiramisu` | Tiramisù | `Dessert`, `Italian cuisine` |
| `tom-yum` | Tom Yum | `Main course`, `Soup`, `Thai cuisine` |
| `tonkatsu` | Tonkatsu | `Japanese cuisine`, `Main course` |
| `tostones` | Tostones | `Appetizer` |
| `vada` | Vada | `Appetizer`, `South Indian cuisine`, `Street snack` |

## 6. Per-dish mapping

Each row: the dish's old categories → its proposed value(s) in each of the 7 dimensions.
`—` means **unset**.

### `acaraje`

- **old categories:** `Appetizer`, `Street snack`
- **`dish_family`:** —
- **`dish_cuisine`:** —
- **`dish_course`:** `appetizer`
- **`dish_technique`:** `frying`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** `street-food`

### `adobo-filipino`

- **old categories:** `Filipino cuisine`, `Main course`, `Stew`
- **`dish_family`:** `stew`
- **`dish_cuisine`:** `filipino`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `braising`, `stewing`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `aloo-gobi`

- **old categories:** `Curry`, `Indian cuisine`, `Main course`
- **`dish_family`:** `curry`
- **`dish_cuisine`:** `indian`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `simmering`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `anticuchos`

- **old categories:** `Kebab`, `Peruvian cuisine`, `Street snack`
- **`dish_family`:** `kebab`
- **`dish_cuisine`:** `peruvian`
- **`dish_course`:** —
- **`dish_technique`:** `grilling`, `skewering`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** `street-food`

### `arepa`

- **old categories:** `Bread`, `Colombian cuisine`, `Main course`
- **`dish_family`:** `bread`
- **`dish_cuisine`:** `colombian`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `baking`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `arroz-con-pollo`

- **old categories:** `Main course`, `Peruvian cuisine`, `Rice dish`
- **`dish_family`:** `rice-dish`
- **`dish_cuisine`:** `peruvian`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `steaming`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `asado`

- **old categories:** `Argentine cuisine`, `Main course`
- **`dish_family`:** —
- **`dish_cuisine`:** `argentine`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `grilling`, `skewering`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `baba-ganoush`

- **old categories:** `Appetizer`, `Lebanese cuisine`, `Sauce`
- **`dish_family`:** `sauce`
- **`dish_cuisine`:** `lebanese`
- **`dish_course`:** `appetizer`
- **`dish_technique`:** —
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `babi-guling`

- **old categories:** `Indonesian cuisine`, `Kebab`, `Main course`
- **`dish_family`:** `kebab`
- **`dish_cuisine`:** `indonesian`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `grilling`, `skewering`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `bacalhau-a-bras`

- **old categories:** `Egg dish`, `Main course`
- **`dish_family`:** `egg-dish`
- **`dish_cuisine`:** —
- **`dish_course`:** `main-course`
- **`dish_technique`:** `frying`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `bakso`

- **old categories:** `Indonesian cuisine`, `Main course`, `Soup`
- **`dish_family`:** —
- **`dish_cuisine`:** `indonesian`
- **`dish_course`:** `soup`
- **`dish_technique`:** `boiling`, `simmering`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `bandeja-paisa`

- **old categories:** `Colombian cuisine`, `Main course`, `Rice dish`
- **`dish_family`:** `rice-dish`
- **`dish_cuisine`:** `colombian`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `steaming`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `banh-mi`

- **old categories:** `Main course`, `Sandwich`, `Vietnamese cuisine`
- **`dish_family`:** `sandwich`
- **`dish_cuisine`:** `vietnamese`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `baking`, `kneading`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `bibimbap`

- **old categories:** `Korean cuisine`, `Main course`, `Rice dish`
- **`dish_family`:** `rice-dish`
- **`dish_cuisine`:** `korean`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `steaming`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `biryani-hyderabadi`

- **old categories:** `Indian cuisine`, `Main course`, `Rice dish`
- **`dish_family`:** `rice-dish`
- **`dish_cuisine`:** `indian`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `steaming`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `boeuf-bourguignon`

- **old categories:** `French cuisine`, `Main course`, `Stew`
- **`dish_family`:** `stew`
- **`dish_cuisine`:** `french`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `braising`, `stewing`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `borscht`

- **old categories:** `Main course`, `Soup`
- **`dish_family`:** —
- **`dish_cuisine`:** —
- **`dish_course`:** `soup`
- **`dish_technique`:** `braising`, `stewing`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `bubur-ayam`

- **old categories:** `Indonesian cuisine`, `Main course`, `Soup`
- **`dish_family`:** —
- **`dish_cuisine`:** `indonesian`
- **`dish_course`:** `soup`
- **`dish_technique`:** `steaming`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `bulgur`

- **old categories:** `Lebanese cuisine`, `Main course`, `Rice dish`
- **`dish_family`:** `rice-dish`
- **`dish_cuisine`:** `lebanese`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `steaming`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `butter-chicken`

- **old categories:** `Curry`, `Indian cuisine`, `Main course`
- **`dish_family`:** `curry`
- **`dish_cuisine`:** `indian`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `simmering`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `cacio-e-pepe`

- **old categories:** `Italian cuisine`, `Main course`, `Pasta`
- **`dish_family`:** `pasta`
- **`dish_cuisine`:** `italian`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `boiling`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `ceviche-peruvian`

- **old categories:** `Appetizer`, `Main course`, `Peruvian cuisine`
- **`dish_family`:** —
- **`dish_cuisine`:** `peruvian`
- **`dish_course`:** `appetizer`
- **`dish_technique`:** `boiling`, `curing`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `char-siu`

- **old categories:** `Chinese cuisine`, `Main course`
- **`dish_family`:** —
- **`dish_cuisine`:** `chinese`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `frying`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `chiles-en-nogada`

- **old categories:** `Main course`, `Mexican cuisine`
- **`dish_family`:** —
- **`dish_cuisine`:** `mexican`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `braising`, `stewing`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `chole-bhature`

- **old categories:** `Bread`, `Curry`, `Indian cuisine`, `Main course`
- **`dish_family`:** —
- **`dish_cuisine`:** `indian`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `simmering`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `choripan`

- **old categories:** `Argentine cuisine`, `Sandwich`, `Street snack`
- **`dish_family`:** `sandwich`
- **`dish_cuisine`:** `argentine`
- **`dish_course`:** —
- **`dish_technique`:** `baking`, `kneading`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** `street-food`

### `chow-mein`

- **old categories:** `Chinese cuisine`, `Main course`, `Stir-fry`
- **`dish_family`:** —
- **`dish_cuisine`:** `chinese`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `steaming`, `stir-frying`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `congee`

- **old categories:** `Chinese cuisine`, `Main course`, `Soup`
- **`dish_family`:** —
- **`dish_cuisine`:** `chinese`
- **`dish_course`:** `soup`
- **`dish_technique`:** `steaming`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `couscous`

- **old categories:** `Main course`, `Stew`
- **`dish_family`:** `stew`
- **`dish_cuisine`:** —
- **`dish_course`:** `main-course`
- **`dish_technique`:** `steaming`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `dan-dan-noodles`

- **old categories:** `Chinese cuisine`, `Main course`, `Noodle soup`
- **`dish_family`:** `noodle-soup`
- **`dish_cuisine`:** `chinese`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `boiling`, `simmering`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `dolma`

- **old categories:** `Appetizer`, `Main course`, `Turkish cuisine`
- **`dish_family`:** —
- **`dish_cuisine`:** `turkish`
- **`dish_course`:** `appetizer`
- **`dish_technique`:** `braising`, `stewing`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `doner-kebab`

- **old categories:** `Kebab`, `Main course`, `Sandwich`, `Turkish cuisine`
- **`dish_family`:** —
- **`dish_cuisine`:** `turkish`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `grilling`, `skewering`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `doro-wat`

- **old categories:** `Ethiopian cuisine`, `Main course`, `Stew`
- **`dish_family`:** `stew`
- **`dish_cuisine`:** `ethiopian`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `braising`, `stewing`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `dosa`

- **old categories:** `Main course`, `Pancake`, `South Indian cuisine`
- **`dish_family`:** `pancake`
- **`dish_cuisine`:** `south-indian`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `frying`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `empanada`

- **old categories:** `Appetizer`, `Argentine cuisine`, `Main course`
- **`dish_family`:** —
- **`dish_cuisine`:** `argentine`
- **`dish_course`:** `appetizer`
- **`dish_technique`:** `frying`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `falafel`

- **old categories:** `Appetizer`, `Israeli cuisine`, `Main course`
- **`dish_family`:** —
- **`dish_cuisine`:** `israeli`
- **`dish_course`:** `appetizer`
- **`dish_technique`:** —
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `fattoush`

- **old categories:** `Appetizer`, `Lebanese cuisine`, `Salad`
- **`dish_family`:** `salad`
- **`dish_cuisine`:** `lebanese`
- **`dish_course`:** `appetizer`
- **`dish_technique`:** —
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `feijoada`

- **old categories:** `Main course`, `Stew`
- **`dish_family`:** `stew`
- **`dish_cuisine`:** —
- **`dish_course`:** `main-course`
- **`dish_technique`:** `braising`, `stewing`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `focaccia`

- **old categories:** `Appetizer`, `Bread`, `Italian cuisine`
- **`dish_family`:** `bread`
- **`dish_cuisine`:** `italian`
- **`dish_course`:** `appetizer`
- **`dish_technique`:** `baking`, `kneading`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `gado-gado`

- **old categories:** `Indonesian cuisine`, `Main course`, `Salad`
- **`dish_family`:** `salad`
- **`dish_cuisine`:** `indonesian`
- **`dish_course`:** `main-course`
- **`dish_technique`:** —
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `gazpacho`

- **old categories:** `Appetizer`, `Soup`, `Spanish cuisine`
- **`dish_family`:** —
- **`dish_cuisine`:** `spanish`
- **`dish_course`:** —
- **`dish_technique`:** —
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `goulash-hungarian`

- **old categories:** `Main course`, `Soup`, `Stew`
- **`dish_family`:** `stew`
- **`dish_cuisine`:** —
- **`dish_course`:** `soup`
- **`dish_technique`:** `braising`, `stewing`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `gyoza`

- **old categories:** `Appetizer`, `Dumpling`, `Japanese cuisine`
- **`dish_family`:** `dumpling`
- **`dish_cuisine`:** `japanese`
- **`dish_course`:** `appetizer`
- **`dish_technique`:** `boiling`, `steaming`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `hainanese-chicken-rice`

- **old categories:** `Main course`, `Rice dish`, `Singaporean cuisine`
- **`dish_family`:** `rice-dish`
- **`dish_cuisine`:** `singaporean`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `steaming`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `halo-halo`

- **old categories:** `Dessert`, `Filipino cuisine`
- **`dish_family`:** —
- **`dish_cuisine`:** `filipino`
- **`dish_course`:** `dessert`
- **`dish_technique`:** `baking`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `hamburger-american`

- **old categories:** `Main course`, `Sandwich`
- **`dish_family`:** `sandwich`
- **`dish_cuisine`:** —
- **`dish_course`:** `main-course`
- **`dish_technique`:** `baking`, `kneading`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `humita`

- **old categories:** `Appetizer`, `Argentine cuisine`, `Main course`
- **`dish_family`:** —
- **`dish_cuisine`:** `argentine`
- **`dish_course`:** `appetizer`
- **`dish_technique`:** `steaming`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `hummus`

- **old categories:** `Appetizer`, `Israeli cuisine`, `Sauce`
- **`dish_family`:** `sauce`
- **`dish_cuisine`:** `israeli`
- **`dish_course`:** `appetizer`
- **`dish_technique`:** —
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `idli`

- **old categories:** `Main course`, `Pancake`, `South Indian cuisine`
- **`dish_family`:** `pancake`
- **`dish_cuisine`:** `south-indian`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `steaming`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `ikan-bakar`

- **old categories:** `Indonesian cuisine`, `Main course`
- **`dish_family`:** —
- **`dish_cuisine`:** `indonesian`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `grilling`, `skewering`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `injera`

- **old categories:** `Bread`, `Ethiopian cuisine`, `Main course`
- **`dish_family`:** `bread`
- **`dish_cuisine`:** `ethiopian`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `baking`, `kneading`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `iskender-kebab`

- **old categories:** `Kebab`, `Main course`, `Turkish cuisine`
- **`dish_family`:** `kebab`
- **`dish_cuisine`:** `turkish`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `grilling`, `skewering`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `japchae`

- **old categories:** `Korean cuisine`, `Main course`, `Noodle soup`, `Stir-fry`
- **`dish_family`:** `noodle-soup`
- **`dish_cuisine`:** `korean`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `steaming`, `stir-frying`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `jiaozi`

- **old categories:** `Chinese cuisine`, `Dumpling`, `Main course`
- **`dish_family`:** `dumpling`
- **`dish_cuisine`:** `chinese`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `steaming`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `jollof-rice`

- **old categories:** `Main course`, `Rice dish`
- **`dish_family`:** `rice-dish`
- **`dish_cuisine`:** —
- **`dish_course`:** `main-course`
- **`dish_technique`:** `steaming`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `kare-kare`

- **old categories:** `Filipino cuisine`, `Main course`, `Stew`
- **`dish_family`:** `stew`
- **`dish_cuisine`:** `filipino`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `braising`, `stewing`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `khao-soi`

- **old categories:** `Curry`, `Main course`, `Noodle soup`
- **`dish_family`:** —
- **`dish_cuisine`:** —
- **`dish_course`:** `main-course`
- **`dish_technique`:** `boiling`, `simmering`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `kibbeh`

- **old categories:** `Appetizer`, `Lebanese cuisine`, `Main course`
- **`dish_family`:** —
- **`dish_cuisine`:** `lebanese`
- **`dish_course`:** `appetizer`
- **`dish_technique`:** `frying`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `kimchi-jjigae`

- **old categories:** `Korean cuisine`, `Main course`, `Soup`, `Stew`
- **`dish_family`:** `stew`
- **`dish_cuisine`:** `korean`
- **`dish_course`:** `soup`
- **`dish_technique`:** `braising`, `stewing`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `kofta`

- **old categories:** `Kebab`, `Lebanese cuisine`, `Main course`
- **`dish_family`:** `kebab`
- **`dish_cuisine`:** `lebanese`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `grilling`, `skewering`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `kung-pao-chicken`

- **old categories:** `Chinese cuisine`, `Main course`, `Stir-fry`
- **`dish_family`:** —
- **`dish_cuisine`:** `chinese`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `frying`, `stir-frying`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `laksa`

- **old categories:** `Main course`, `Noodle soup`, `Singaporean cuisine`, `Soup`
- **`dish_family`:** `noodle-soup`
- **`dish_cuisine`:** `singaporean`
- **`dish_course`:** `soup`
- **`dish_technique`:** `boiling`, `simmering`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `lechon`

- **old categories:** `Filipino cuisine`, `Main course`
- **`dish_family`:** —
- **`dish_cuisine`:** `filipino`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `grilling`, `skewering`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `lomo-saltado`

- **old categories:** `Main course`, `Peruvian cuisine`, `Stir-fry`
- **`dish_family`:** —
- **`dish_cuisine`:** `peruvian`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `steaming`, `stir-frying`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `mansaf`

- **old categories:** `Main course`, `Stew`
- **`dish_family`:** `stew`
- **`dish_cuisine`:** —
- **`dish_course`:** `main-course`
- **`dish_technique`:** `braising`, `stewing`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `manti`

- **old categories:** `Dumpling`, `Main course`, `Turkish cuisine`
- **`dish_family`:** `dumpling`
- **`dish_cuisine`:** `turkish`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `boiling`, `steaming`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `mapo-tofu`

- **old categories:** `Chinese cuisine`, `Main course`, `Stew`
- **`dish_family`:** `stew`
- **`dish_cuisine`:** `chinese`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `poaching`, `simmering`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `martabak`

- **old categories:** `Indonesian cuisine`, `Pancake`, `Street snack`
- **`dish_family`:** `pancake`
- **`dish_cuisine`:** `indonesian`
- **`dish_course`:** —
- **`dish_technique`:** `baking`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** `street-food`

### `masala-dosa`

- **old categories:** `Main course`, `Pancake`, `South Indian cuisine`
- **`dish_family`:** `pancake`
- **`dish_cuisine`:** `south-indian`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `baking`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `menemen`

- **old categories:** `Main course`, `Turkish cuisine`
- **`dish_family`:** —
- **`dish_cuisine`:** `turkish`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `poaching`, `simmering`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `mole-poblano`

- **old categories:** `Main course`, `Mexican cuisine`, `Sauce`
- **`dish_family`:** `sauce`
- **`dish_cuisine`:** `mexican`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `simmering`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `momo`

- **old categories:** `Appetizer`, `Dumpling`
- **`dish_family`:** `dumpling`
- **`dish_cuisine`:** —
- **`dish_course`:** `appetizer`
- **`dish_technique`:** `steaming`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `moussaka-greek`

- **old categories:** `Casserole`, `Main course`
- **`dish_family`:** `casserole`
- **`dish_cuisine`:** —
- **`dish_course`:** `main-course`
- **`dish_technique`:** `frying`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `moussaka-levant`

- **old categories:** `Casserole`, `Lebanese cuisine`, `Main course`
- **`dish_family`:** `casserole`
- **`dish_cuisine`:** `lebanese`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `frying`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `musakka-turkish`

- **old categories:** `Casserole`, `Main course`, `Turkish cuisine`
- **`dish_family`:** `casserole`
- **`dish_cuisine`:** `turkish`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `frying`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `nasi-campur-bali`

- **old categories:** `Indonesian cuisine`, `Main course`, `Rice dish`
- **`dish_family`:** `rice-dish`
- **`dish_cuisine`:** `indonesian`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `steaming`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `nasi-goreng`

- **old categories:** `Fried rice`, `Indonesian cuisine`, `Main course`
- **`dish_family`:** `fried-rice`
- **`dish_cuisine`:** `indonesian`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `steaming`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `nasi-padang`

- **old categories:** `Indonesian cuisine`, `Main course`, `Rice dish`
- **`dish_family`:** `rice-dish`
- **`dish_cuisine`:** `indonesian`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `steaming`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `okonomiyaki`

- **old categories:** `Japanese cuisine`, `Main course`, `Pancake`
- **`dish_family`:** `pancake`
- **`dish_cuisine`:** `japanese`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `frying`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `pad-thai`

- **old categories:** `Main course`, `Noodle soup`, `Stir-fry`, `Thai cuisine`
- **`dish_family`:** `noodle-soup`
- **`dish_cuisine`:** `thai`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `boiling`, `simmering`, `stir-frying`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `paella-valenciana`

- **old categories:** `Main course`, `Rice dish`, `Spanish cuisine`
- **`dish_family`:** `rice-dish`
- **`dish_cuisine`:** `spanish`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `steaming`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `palak-paneer`

- **old categories:** `Curry`, `Indian cuisine`, `Main course`
- **`dish_family`:** `curry`
- **`dish_cuisine`:** `indian`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `simmering`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `peking-duck`

- **old categories:** `Chinese cuisine`, `Main course`
- **`dish_family`:** —
- **`dish_cuisine`:** `chinese`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `frying`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `pempek`

- **old categories:** `Appetizer`, `Indonesian cuisine`, `Main course`
- **`dish_family`:** —
- **`dish_cuisine`:** `indonesian`
- **`dish_course`:** `appetizer`
- **`dish_technique`:** —
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `pho-vietnamese`

- **old categories:** `Main course`, `Noodle soup`, `Vietnamese cuisine`
- **`dish_family`:** `noodle-soup`
- **`dish_cuisine`:** `vietnamese`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `boiling`, `simmering`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `pide`

- **old categories:** `Bread`, `Main course`, `Turkish cuisine`
- **`dish_family`:** `bread`
- **`dish_cuisine`:** `turkish`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `baking`, `kneading`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `pierogi`

- **old categories:** `Dumpling`, `Main course`
- **`dish_family`:** `dumpling`
- **`dish_cuisine`:** —
- **`dish_course`:** `main-course`
- **`dish_technique`:** `boiling`, `steaming`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `pizza-margherita`

- **old categories:** `Bread`, `Italian cuisine`, `Main course`
- **`dish_family`:** `bread`
- **`dish_cuisine`:** `italian`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `baking`, `kneading`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `poutine`

- **old categories:** `Main course`, `Street snack`
- **`dish_family`:** —
- **`dish_cuisine`:** —
- **`dish_course`:** `main-course`
- **`dish_technique`:** `frying`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** `street-food`

### `ramen-japanese`

- **old categories:** `Japanese cuisine`, `Main course`, `Noodle soup`
- **`dish_family`:** `noodle-soup`
- **`dish_cuisine`:** `japanese`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `boiling`, `simmering`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `rawon`

- **old categories:** `Indonesian cuisine`, `Main course`, `Soup`
- **`dish_family`:** —
- **`dish_cuisine`:** `indonesian`
- **`dish_course`:** `soup`
- **`dish_technique`:** `braising`, `stewing`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `risotto-alla-milanese`

- **old categories:** `Italian cuisine`, `Main course`, `Rice dish`
- **`dish_family`:** `rice-dish`
- **`dish_cuisine`:** `italian`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `frying`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `sambal`

- **old categories:** `Appetizer`, `Indonesian cuisine`, `Sauce`
- **`dish_family`:** `sauce`
- **`dish_cuisine`:** `indonesian`
- **`dish_course`:** `appetizer`
- **`dish_technique`:** —
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `samosa`

- **old categories:** `Appetizer`, `Indian cuisine`, `Street snack`
- **`dish_family`:** —
- **`dish_cuisine`:** `indian`
- **`dish_course`:** `appetizer`
- **`dish_technique`:** `frying`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** `street-food`

### `satay`

- **old categories:** `Indonesian cuisine`, `Kebab`, `Street snack`
- **`dish_family`:** `kebab`
- **`dish_cuisine`:** `indonesian`
- **`dish_course`:** —
- **`dish_technique`:** `grilling`, `skewering`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** `street-food`

### `sate-lilit`

- **old categories:** `Appetizer`, `Indonesian cuisine`, `Kebab`
- **`dish_family`:** `kebab`
- **`dish_cuisine`:** `indonesian`
- **`dish_course`:** `appetizer`
- **`dish_technique`:** `grilling`, `skewering`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `shakshuka`

- **old categories:** `Israeli cuisine`, `Main course`
- **`dish_family`:** —
- **`dish_cuisine`:** `israeli`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `poaching`, `simmering`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `shawarma`

- **old categories:** `Lebanese cuisine`, `Main course`, `Sandwich`
- **`dish_family`:** `sandwich`
- **`dish_cuisine`:** `lebanese`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `grilling`, `skewering`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `sinigang`

- **old categories:** `Filipino cuisine`, `Main course`, `Soup`
- **`dish_family`:** —
- **`dish_cuisine`:** `filipino`
- **`dish_course`:** `soup`
- **`dish_technique`:** `braising`, `stewing`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `soba`

- **old categories:** `Japanese cuisine`, `Main course`, `Noodle soup`
- **`dish_family`:** `noodle-soup`
- **`dish_cuisine`:** `japanese`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `boiling`, `simmering`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `soto-ayam`

- **old categories:** `Indonesian cuisine`, `Main course`, `Soup`
- **`dish_family`:** —
- **`dish_cuisine`:** `indonesian`
- **`dish_course`:** `soup`
- **`dish_technique`:** `braising`, `stewing`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `sushi`

- **old categories:** `Japanese cuisine`, `Main course`
- **`dish_family`:** —
- **`dish_cuisine`:** `japanese`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `boiling`, `curing`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `tabbouleh`

- **old categories:** `Appetizer`, `Lebanese cuisine`, `Salad`
- **`dish_family`:** `salad`
- **`dish_cuisine`:** `lebanese`
- **`dish_course`:** `appetizer`
- **`dish_technique`:** —
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `tagine-moroccan`

- **old categories:** `Main course`, `Stew`
- **`dish_family`:** `stew`
- **`dish_cuisine`:** —
- **`dish_course`:** `main-course`
- **`dish_technique`:** `braising`, `stewing`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `takoyaki`

- **old categories:** `Appetizer`, `Japanese cuisine`, `Street snack`
- **`dish_family`:** —
- **`dish_cuisine`:** `japanese`
- **`dish_course`:** `appetizer`
- **`dish_technique`:** `frying`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** `street-food`

### `tamales`

- **old categories:** `Appetizer`, `Main course`, `Mexican cuisine`
- **`dish_family`:** —
- **`dish_cuisine`:** `mexican`
- **`dish_course`:** `appetizer`
- **`dish_technique`:** `steaming`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `tarte-tatin`

- **old categories:** `Dessert`, `French cuisine`
- **`dish_family`:** —
- **`dish_cuisine`:** `french`
- **`dish_course`:** `dessert`
- **`dish_technique`:** `baking`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `tempura`

- **old categories:** `Appetizer`, `Japanese cuisine`, `Main course`
- **`dish_family`:** —
- **`dish_cuisine`:** `japanese`
- **`dish_course`:** `appetizer`
- **`dish_technique`:** `frying`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `tiramisu`

- **old categories:** `Dessert`, `Italian cuisine`
- **`dish_family`:** —
- **`dish_cuisine`:** `italian`
- **`dish_course`:** `dessert`
- **`dish_technique`:** `baking`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `tom-yum`

- **old categories:** `Main course`, `Soup`, `Thai cuisine`
- **`dish_family`:** —
- **`dish_cuisine`:** `thai`
- **`dish_course`:** `soup`
- **`dish_technique`:** `braising`, `stewing`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `tonkatsu`

- **old categories:** `Japanese cuisine`, `Main course`
- **`dish_family`:** —
- **`dish_cuisine`:** `japanese`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `frying`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `tostones`

- **old categories:** `Appetizer`
- **`dish_family`:** —
- **`dish_cuisine`:** —
- **`dish_course`:** `appetizer`
- **`dish_technique`:** `frying`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `udon`

- **old categories:** `Japanese cuisine`, `Main course`, `Noodle soup`
- **`dish_family`:** `noodle-soup`
- **`dish_cuisine`:** `japanese`
- **`dish_course`:** `main-course`
- **`dish_technique`:** `boiling`, `simmering`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `vada`

- **old categories:** `Appetizer`, `South Indian cuisine`, `Street snack`
- **`dish_family`:** —
- **`dish_cuisine`:** `south-indian`
- **`dish_course`:** `appetizer`
- **`dish_technique`:** `frying`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** `street-food`

### `vindaloo`

- **old categories:** `Curry`, `Main course`
- **`dish_family`:** `curry`
- **`dish_cuisine`:** —
- **`dish_course`:** `main-course`
- **`dish_technique`:** `braising`, `stewing`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `wiener-schnitzel`

- **old categories:** `Breaded cutlet`, `Main course`
- **`dish_family`:** `breaded-cutlet`
- **`dish_cuisine`:** —
- **`dish_course`:** `main-course`
- **`dish_technique`:** `frying`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `xiaolongbao`

- **old categories:** `Appetizer`, `Chinese cuisine`, `Dumpling`
- **`dish_family`:** `dumpling`
- **`dish_cuisine`:** `chinese`
- **`dish_course`:** `appetizer`
- **`dish_technique`:** `steaming`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** —

### `yakitori`

- **old categories:** `Japanese cuisine`, `Kebab`, `Street snack`
- **`dish_family`:** `kebab`
- **`dish_cuisine`:** `japanese`
- **`dish_course`:** —
- **`dish_technique`:** `grilling`, `skewering`
- **`ingredient_category`:** —
- **`dish_tradition`:** —
- **`dish_context`:** `street-food`

## 7. Machine-readable mapping

```json
{
  "acaraje": {
    "dish_context": [
      "street-food"
    ],
    "dish_course": [
      "appetizer"
    ],
    "dish_cuisine": [],
    "dish_family": [],
    "dish_technique": [
      "frying"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "adobo-filipino": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "filipino"
    ],
    "dish_family": [
      "stew"
    ],
    "dish_technique": [
      "stewing",
      "braising"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "aloo-gobi": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "indian"
    ],
    "dish_family": [
      "curry"
    ],
    "dish_technique": [
      "simmering"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "anticuchos": {
    "dish_context": [
      "street-food"
    ],
    "dish_course": [],
    "dish_cuisine": [
      "peruvian"
    ],
    "dish_family": [
      "kebab"
    ],
    "dish_technique": [
      "grilling",
      "skewering"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "arepa": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "colombian"
    ],
    "dish_family": [
      "bread"
    ],
    "dish_technique": [
      "baking"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "arroz-con-pollo": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "peruvian"
    ],
    "dish_family": [
      "rice-dish"
    ],
    "dish_technique": [
      "steaming"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "asado": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "argentine"
    ],
    "dish_family": [],
    "dish_technique": [
      "grilling",
      "skewering"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "baba-ganoush": {
    "dish_context": [],
    "dish_course": [
      "appetizer"
    ],
    "dish_cuisine": [
      "lebanese"
    ],
    "dish_family": [
      "sauce"
    ],
    "dish_technique": [],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "babi-guling": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "indonesian"
    ],
    "dish_family": [
      "kebab"
    ],
    "dish_technique": [
      "grilling",
      "skewering"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "bacalhau-a-bras": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [],
    "dish_family": [
      "egg-dish"
    ],
    "dish_technique": [
      "frying"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "bakso": {
    "dish_context": [],
    "dish_course": [
      "soup"
    ],
    "dish_cuisine": [
      "indonesian"
    ],
    "dish_family": [],
    "dish_technique": [
      "boiling",
      "simmering"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "bandeja-paisa": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "colombian"
    ],
    "dish_family": [
      "rice-dish"
    ],
    "dish_technique": [
      "steaming"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "banh-mi": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "vietnamese"
    ],
    "dish_family": [
      "sandwich"
    ],
    "dish_technique": [
      "baking",
      "kneading"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "bibimbap": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "korean"
    ],
    "dish_family": [
      "rice-dish"
    ],
    "dish_technique": [
      "steaming"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "biryani-hyderabadi": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "indian"
    ],
    "dish_family": [
      "rice-dish"
    ],
    "dish_technique": [
      "steaming"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "boeuf-bourguignon": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "french"
    ],
    "dish_family": [
      "stew"
    ],
    "dish_technique": [
      "stewing",
      "braising"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "borscht": {
    "dish_context": [],
    "dish_course": [
      "soup"
    ],
    "dish_cuisine": [],
    "dish_family": [],
    "dish_technique": [
      "stewing",
      "braising"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "bubur-ayam": {
    "dish_context": [],
    "dish_course": [
      "soup"
    ],
    "dish_cuisine": [
      "indonesian"
    ],
    "dish_family": [],
    "dish_technique": [
      "steaming"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "bulgur": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "lebanese"
    ],
    "dish_family": [
      "rice-dish"
    ],
    "dish_technique": [
      "steaming"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "butter-chicken": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "indian"
    ],
    "dish_family": [
      "curry"
    ],
    "dish_technique": [
      "simmering"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "cacio-e-pepe": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "italian"
    ],
    "dish_family": [
      "pasta"
    ],
    "dish_technique": [
      "boiling"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "ceviche-peruvian": {
    "dish_context": [],
    "dish_course": [
      "appetizer"
    ],
    "dish_cuisine": [
      "peruvian"
    ],
    "dish_family": [],
    "dish_technique": [
      "boiling",
      "curing"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "char-siu": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "chinese"
    ],
    "dish_family": [],
    "dish_technique": [
      "frying"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "chiles-en-nogada": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "mexican"
    ],
    "dish_family": [],
    "dish_technique": [
      "stewing",
      "braising"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "chole-bhature": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "indian"
    ],
    "dish_family": [],
    "dish_technique": [
      "simmering"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "choripan": {
    "dish_context": [
      "street-food"
    ],
    "dish_course": [],
    "dish_cuisine": [
      "argentine"
    ],
    "dish_family": [
      "sandwich"
    ],
    "dish_technique": [
      "baking",
      "kneading"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "chow-mein": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "chinese"
    ],
    "dish_family": [],
    "dish_technique": [
      "stir-frying",
      "steaming"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "congee": {
    "dish_context": [],
    "dish_course": [
      "soup"
    ],
    "dish_cuisine": [
      "chinese"
    ],
    "dish_family": [],
    "dish_technique": [
      "steaming"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "couscous": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [],
    "dish_family": [
      "stew"
    ],
    "dish_technique": [
      "steaming"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "dan-dan-noodles": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "chinese"
    ],
    "dish_family": [
      "noodle-soup"
    ],
    "dish_technique": [
      "boiling",
      "simmering"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "dolma": {
    "dish_context": [],
    "dish_course": [
      "appetizer"
    ],
    "dish_cuisine": [
      "turkish"
    ],
    "dish_family": [],
    "dish_technique": [
      "stewing",
      "braising"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "doner-kebab": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "turkish"
    ],
    "dish_family": [],
    "dish_technique": [
      "grilling",
      "skewering"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "doro-wat": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "ethiopian"
    ],
    "dish_family": [
      "stew"
    ],
    "dish_technique": [
      "stewing",
      "braising"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "dosa": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "south-indian"
    ],
    "dish_family": [
      "pancake"
    ],
    "dish_technique": [
      "frying"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "empanada": {
    "dish_context": [],
    "dish_course": [
      "appetizer"
    ],
    "dish_cuisine": [
      "argentine"
    ],
    "dish_family": [],
    "dish_technique": [
      "frying"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "falafel": {
    "dish_context": [],
    "dish_course": [
      "appetizer"
    ],
    "dish_cuisine": [
      "israeli"
    ],
    "dish_family": [],
    "dish_technique": [],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "fattoush": {
    "dish_context": [],
    "dish_course": [
      "appetizer"
    ],
    "dish_cuisine": [
      "lebanese"
    ],
    "dish_family": [
      "salad"
    ],
    "dish_technique": [],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "feijoada": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [],
    "dish_family": [
      "stew"
    ],
    "dish_technique": [
      "stewing",
      "braising"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "focaccia": {
    "dish_context": [],
    "dish_course": [
      "appetizer"
    ],
    "dish_cuisine": [
      "italian"
    ],
    "dish_family": [
      "bread"
    ],
    "dish_technique": [
      "baking",
      "kneading"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "gado-gado": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "indonesian"
    ],
    "dish_family": [
      "salad"
    ],
    "dish_technique": [],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "gazpacho": {
    "dish_context": [],
    "dish_course": [],
    "dish_cuisine": [
      "spanish"
    ],
    "dish_family": [],
    "dish_technique": [],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "goulash-hungarian": {
    "dish_context": [],
    "dish_course": [
      "soup"
    ],
    "dish_cuisine": [],
    "dish_family": [
      "stew"
    ],
    "dish_technique": [
      "stewing",
      "braising"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "gyoza": {
    "dish_context": [],
    "dish_course": [
      "appetizer"
    ],
    "dish_cuisine": [
      "japanese"
    ],
    "dish_family": [
      "dumpling"
    ],
    "dish_technique": [
      "steaming",
      "boiling"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "hainanese-chicken-rice": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "singaporean"
    ],
    "dish_family": [
      "rice-dish"
    ],
    "dish_technique": [
      "steaming"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "halo-halo": {
    "dish_context": [],
    "dish_course": [
      "dessert"
    ],
    "dish_cuisine": [
      "filipino"
    ],
    "dish_family": [],
    "dish_technique": [
      "baking"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "hamburger-american": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [],
    "dish_family": [
      "sandwich"
    ],
    "dish_technique": [
      "baking",
      "kneading"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "humita": {
    "dish_context": [],
    "dish_course": [
      "appetizer"
    ],
    "dish_cuisine": [
      "argentine"
    ],
    "dish_family": [],
    "dish_technique": [
      "steaming"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "hummus": {
    "dish_context": [],
    "dish_course": [
      "appetizer"
    ],
    "dish_cuisine": [
      "israeli"
    ],
    "dish_family": [
      "sauce"
    ],
    "dish_technique": [],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "idli": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "south-indian"
    ],
    "dish_family": [
      "pancake"
    ],
    "dish_technique": [
      "steaming"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "ikan-bakar": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "indonesian"
    ],
    "dish_family": [],
    "dish_technique": [
      "grilling",
      "skewering"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "injera": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "ethiopian"
    ],
    "dish_family": [
      "bread"
    ],
    "dish_technique": [
      "baking",
      "kneading"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "iskender-kebab": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "turkish"
    ],
    "dish_family": [
      "kebab"
    ],
    "dish_technique": [
      "grilling",
      "skewering"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "japchae": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "korean"
    ],
    "dish_family": [
      "noodle-soup"
    ],
    "dish_technique": [
      "stir-frying",
      "steaming"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "jiaozi": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "chinese"
    ],
    "dish_family": [
      "dumpling"
    ],
    "dish_technique": [
      "steaming"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "jollof-rice": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [],
    "dish_family": [
      "rice-dish"
    ],
    "dish_technique": [
      "steaming"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "kare-kare": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "filipino"
    ],
    "dish_family": [
      "stew"
    ],
    "dish_technique": [
      "stewing",
      "braising"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "khao-soi": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [],
    "dish_family": [],
    "dish_technique": [
      "boiling",
      "simmering"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "kibbeh": {
    "dish_context": [],
    "dish_course": [
      "appetizer"
    ],
    "dish_cuisine": [
      "lebanese"
    ],
    "dish_family": [],
    "dish_technique": [
      "frying"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "kimchi-jjigae": {
    "dish_context": [],
    "dish_course": [
      "soup"
    ],
    "dish_cuisine": [
      "korean"
    ],
    "dish_family": [
      "stew"
    ],
    "dish_technique": [
      "stewing",
      "braising"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "kofta": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "lebanese"
    ],
    "dish_family": [
      "kebab"
    ],
    "dish_technique": [
      "grilling",
      "skewering"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "kung-pao-chicken": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "chinese"
    ],
    "dish_family": [],
    "dish_technique": [
      "stir-frying",
      "frying"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "laksa": {
    "dish_context": [],
    "dish_course": [
      "soup"
    ],
    "dish_cuisine": [
      "singaporean"
    ],
    "dish_family": [
      "noodle-soup"
    ],
    "dish_technique": [
      "boiling",
      "simmering"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "lechon": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "filipino"
    ],
    "dish_family": [],
    "dish_technique": [
      "grilling",
      "skewering"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "lomo-saltado": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "peruvian"
    ],
    "dish_family": [],
    "dish_technique": [
      "stir-frying",
      "steaming"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "mansaf": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [],
    "dish_family": [
      "stew"
    ],
    "dish_technique": [
      "stewing",
      "braising"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "manti": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "turkish"
    ],
    "dish_family": [
      "dumpling"
    ],
    "dish_technique": [
      "steaming",
      "boiling"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "mapo-tofu": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "chinese"
    ],
    "dish_family": [
      "stew"
    ],
    "dish_technique": [
      "poaching",
      "simmering"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "martabak": {
    "dish_context": [
      "street-food"
    ],
    "dish_course": [],
    "dish_cuisine": [
      "indonesian"
    ],
    "dish_family": [
      "pancake"
    ],
    "dish_technique": [
      "baking"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "masala-dosa": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "south-indian"
    ],
    "dish_family": [
      "pancake"
    ],
    "dish_technique": [
      "baking"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "menemen": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "turkish"
    ],
    "dish_family": [],
    "dish_technique": [
      "poaching",
      "simmering"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "mole-poblano": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "mexican"
    ],
    "dish_family": [
      "sauce"
    ],
    "dish_technique": [
      "simmering"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "momo": {
    "dish_context": [],
    "dish_course": [
      "appetizer"
    ],
    "dish_cuisine": [],
    "dish_family": [
      "dumpling"
    ],
    "dish_technique": [
      "steaming"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "moussaka-greek": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [],
    "dish_family": [
      "casserole"
    ],
    "dish_technique": [
      "frying"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "moussaka-levant": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "lebanese"
    ],
    "dish_family": [
      "casserole"
    ],
    "dish_technique": [
      "frying"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "musakka-turkish": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "turkish"
    ],
    "dish_family": [
      "casserole"
    ],
    "dish_technique": [
      "frying"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "nasi-campur-bali": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "indonesian"
    ],
    "dish_family": [
      "rice-dish"
    ],
    "dish_technique": [
      "steaming"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "nasi-goreng": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "indonesian"
    ],
    "dish_family": [
      "fried-rice"
    ],
    "dish_technique": [
      "steaming"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "nasi-padang": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "indonesian"
    ],
    "dish_family": [
      "rice-dish"
    ],
    "dish_technique": [
      "steaming"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "okonomiyaki": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "japanese"
    ],
    "dish_family": [
      "pancake"
    ],
    "dish_technique": [
      "frying"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "pad-thai": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "thai"
    ],
    "dish_family": [
      "noodle-soup"
    ],
    "dish_technique": [
      "stir-frying",
      "boiling",
      "simmering"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "paella-valenciana": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "spanish"
    ],
    "dish_family": [
      "rice-dish"
    ],
    "dish_technique": [
      "steaming"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "palak-paneer": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "indian"
    ],
    "dish_family": [
      "curry"
    ],
    "dish_technique": [
      "simmering"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "peking-duck": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "chinese"
    ],
    "dish_family": [],
    "dish_technique": [
      "frying"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "pempek": {
    "dish_context": [],
    "dish_course": [
      "appetizer"
    ],
    "dish_cuisine": [
      "indonesian"
    ],
    "dish_family": [],
    "dish_technique": [],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "pho-vietnamese": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "vietnamese"
    ],
    "dish_family": [
      "noodle-soup"
    ],
    "dish_technique": [
      "boiling",
      "simmering"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "pide": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "turkish"
    ],
    "dish_family": [
      "bread"
    ],
    "dish_technique": [
      "baking",
      "kneading"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "pierogi": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [],
    "dish_family": [
      "dumpling"
    ],
    "dish_technique": [
      "steaming",
      "boiling"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "pizza-margherita": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "italian"
    ],
    "dish_family": [
      "bread"
    ],
    "dish_technique": [
      "baking",
      "kneading"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "poutine": {
    "dish_context": [
      "street-food"
    ],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [],
    "dish_family": [],
    "dish_technique": [
      "frying"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "ramen-japanese": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "japanese"
    ],
    "dish_family": [
      "noodle-soup"
    ],
    "dish_technique": [
      "boiling",
      "simmering"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "rawon": {
    "dish_context": [],
    "dish_course": [
      "soup"
    ],
    "dish_cuisine": [
      "indonesian"
    ],
    "dish_family": [],
    "dish_technique": [
      "stewing",
      "braising"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "risotto-alla-milanese": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "italian"
    ],
    "dish_family": [
      "rice-dish"
    ],
    "dish_technique": [
      "frying"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "sambal": {
    "dish_context": [],
    "dish_course": [
      "appetizer"
    ],
    "dish_cuisine": [
      "indonesian"
    ],
    "dish_family": [
      "sauce"
    ],
    "dish_technique": [],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "samosa": {
    "dish_context": [
      "street-food"
    ],
    "dish_course": [
      "appetizer"
    ],
    "dish_cuisine": [
      "indian"
    ],
    "dish_family": [],
    "dish_technique": [
      "frying"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "satay": {
    "dish_context": [
      "street-food"
    ],
    "dish_course": [],
    "dish_cuisine": [
      "indonesian"
    ],
    "dish_family": [
      "kebab"
    ],
    "dish_technique": [
      "grilling",
      "skewering"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "sate-lilit": {
    "dish_context": [],
    "dish_course": [
      "appetizer"
    ],
    "dish_cuisine": [
      "indonesian"
    ],
    "dish_family": [
      "kebab"
    ],
    "dish_technique": [
      "grilling",
      "skewering"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "shakshuka": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "israeli"
    ],
    "dish_family": [],
    "dish_technique": [
      "poaching",
      "simmering"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "shawarma": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "lebanese"
    ],
    "dish_family": [
      "sandwich"
    ],
    "dish_technique": [
      "grilling",
      "skewering"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "sinigang": {
    "dish_context": [],
    "dish_course": [
      "soup"
    ],
    "dish_cuisine": [
      "filipino"
    ],
    "dish_family": [],
    "dish_technique": [
      "stewing",
      "braising"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "soba": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "japanese"
    ],
    "dish_family": [
      "noodle-soup"
    ],
    "dish_technique": [
      "boiling",
      "simmering"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "soto-ayam": {
    "dish_context": [],
    "dish_course": [
      "soup"
    ],
    "dish_cuisine": [
      "indonesian"
    ],
    "dish_family": [],
    "dish_technique": [
      "stewing",
      "braising"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "sushi": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "japanese"
    ],
    "dish_family": [],
    "dish_technique": [
      "boiling",
      "curing"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "tabbouleh": {
    "dish_context": [],
    "dish_course": [
      "appetizer"
    ],
    "dish_cuisine": [
      "lebanese"
    ],
    "dish_family": [
      "salad"
    ],
    "dish_technique": [],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "tagine-moroccan": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [],
    "dish_family": [
      "stew"
    ],
    "dish_technique": [
      "stewing",
      "braising"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "takoyaki": {
    "dish_context": [
      "street-food"
    ],
    "dish_course": [
      "appetizer"
    ],
    "dish_cuisine": [
      "japanese"
    ],
    "dish_family": [],
    "dish_technique": [
      "frying"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "tamales": {
    "dish_context": [],
    "dish_course": [
      "appetizer"
    ],
    "dish_cuisine": [
      "mexican"
    ],
    "dish_family": [],
    "dish_technique": [
      "steaming"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "tarte-tatin": {
    "dish_context": [],
    "dish_course": [
      "dessert"
    ],
    "dish_cuisine": [
      "french"
    ],
    "dish_family": [],
    "dish_technique": [
      "baking"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "tempura": {
    "dish_context": [],
    "dish_course": [
      "appetizer"
    ],
    "dish_cuisine": [
      "japanese"
    ],
    "dish_family": [],
    "dish_technique": [
      "frying"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "tiramisu": {
    "dish_context": [],
    "dish_course": [
      "dessert"
    ],
    "dish_cuisine": [
      "italian"
    ],
    "dish_family": [],
    "dish_technique": [
      "baking"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "tom-yum": {
    "dish_context": [],
    "dish_course": [
      "soup"
    ],
    "dish_cuisine": [
      "thai"
    ],
    "dish_family": [],
    "dish_technique": [
      "stewing",
      "braising"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "tonkatsu": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "japanese"
    ],
    "dish_family": [],
    "dish_technique": [
      "frying"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "tostones": {
    "dish_context": [],
    "dish_course": [
      "appetizer"
    ],
    "dish_cuisine": [],
    "dish_family": [],
    "dish_technique": [
      "frying"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "udon": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [
      "japanese"
    ],
    "dish_family": [
      "noodle-soup"
    ],
    "dish_technique": [
      "boiling",
      "simmering"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "vada": {
    "dish_context": [
      "street-food"
    ],
    "dish_course": [
      "appetizer"
    ],
    "dish_cuisine": [
      "south-indian"
    ],
    "dish_family": [],
    "dish_technique": [
      "frying"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "vindaloo": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [],
    "dish_family": [
      "curry"
    ],
    "dish_technique": [
      "stewing",
      "braising"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "wiener-schnitzel": {
    "dish_context": [],
    "dish_course": [
      "main-course"
    ],
    "dish_cuisine": [],
    "dish_family": [
      "breaded-cutlet"
    ],
    "dish_technique": [
      "frying"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "xiaolongbao": {
    "dish_context": [],
    "dish_course": [
      "appetizer"
    ],
    "dish_cuisine": [
      "chinese"
    ],
    "dish_family": [
      "dumpling"
    ],
    "dish_technique": [
      "steaming"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  },
  "yakitori": {
    "dish_context": [
      "street-food"
    ],
    "dish_course": [],
    "dish_cuisine": [
      "japanese"
    ],
    "dish_family": [
      "kebab"
    ],
    "dish_technique": [
      "grilling",
      "skewering"
    ],
    "dish_tradition": [],
    "ingredient_category": []
  }
}
```
