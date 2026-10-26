# GUS-224 — Option B migration plan + quarantine list

**Task:** GUS-224 · **Status:** 🟡 **PROPOSAL — for Alejandro's review. NOTHING APPLIED.**
**Date:** 2026-10-26 · **Audit tool:** `scripts/hermes/gus-014-audit-relations.py` · **Audit report:** `.hermes/REPORTS/GUS-224-relations-audit.md`

---

## 0. Corrections applied to the audit

Four corrections were made to the first audit pass. They change its conclusions materially.

### Correction 1 — identical `relation_type` on both rows IS the contradiction (directional types)

The first audit treated "identical `relation_type` on the reverse row" as **consistency**. That is backwards for directional types.

A directional `relation_type` (`ancestor`, `diaspora`) stores an **order**: `from` = source, `to` = target. Storing both directions therefore makes the table assert:

- `shawarma → tacos-al-pastor` ⇒ *"shawarma is the ancestor of tacos-al-pastor"*
- `tacos-al-pastor → shawarma` ⇒ *"**tacos-al-pastor is the ancestor of shawarma**"*

**The two cannot both be true.** Identical types across a pair is the *symptom* of the contradiction, not evidence of consistency.

**Result: all 5 directional pairs are self-contradicting — including the pilot pair this session wrote.** The first audit's "D3g consistency check PASSED" conclusion was wrong and is withdrawn.

For **symmetric** types (`family`, `shared-method`, `similar-serving`, `regional-cousin`, `shared-ingredient`) a stored pair is redundant but not contradictory — the relation holds equally in both directions.

### Correction 2 — `tonkatsu ↔ wiener-schnitzel` is likely wrong

The first audit cited Wikipedia *Tonkatsu* as support. The quote supports a **French *côte de veau*** origin, not a Wiener schnitzel one. Wikipedia *Wiener schnitzel* traces a **different lineage**: Nuremberg 1691 partridge, the "Wiener Schnitzel" designation in the 19th century, and the Radetzky story (recipe brought from Italy 1857) which Pohl says is *"instead concerned with the dish veal Milanese"*.

The two dishes descend from different European ancestors. The relation's reason — *"Tonkatsu is the Japanese adaptation of European breaded cutlets"* — is too vague to be false about *any* European cutlet, but it does not support **this** pairing.

**Directional pairs that are likely wrong: 4 of 5** (was 3 of 5).

### Correction 3 — "sourced" relabelled "single tertiary source (Wikipedia)"

Every relation claim rests on **exactly one** tertiary source. "Sourced" overstated that. The pilot's relation is **not independently corroborated** — it has one Wikipedia article, and the GUS-014 pilot wrote its own relation, so the pilot cannot be its own corroboration.

**Verdict vocabulary now used:**

| verdict | meaning |
|---|---|
| `single_tertiary_source` | supported by exactly one tertiary source (Wikipedia) — **not** corroborated |
| `unverified` | no relation-level source exists |
| `likely_wrong` | contradicted, mis-wired, or unsupported |

### Correction 4 — `shawarma ↔ hamburger-american`: quarantine only, no rewire

The claim (döner kebab's 1970s West Berlin diaspora → the hamburger-among-immigrants) is supported by one tertiary source. But the relation connects `shawarma`. `doner-kebab` exists as a dish and has **zero** relations.

**Rewiring to `doner-kebab` would be a NEW claim, not a correction** — it introduces a relation that no source in the catalog asserts. So this pair is **quarantine-only**. No hand edit, no rewire.

---

## 1. Corrected audit results

**192 rows = 96 pairs. 5 directional, 91 symmetric.**

| relation_type | directional | pairs | self-contradicting | single tertiary source | unverified | likely_wrong |
|---|---|---|---|---|---|---|
| `family` | no | 52 | — | 0 | 52 | 0 |
| `regional-cousin` | no | 15 | — | 0 | 15 | 0 |
| `shared-method` | no | 14 | — | 0 | 14 | 0 |
| `similar-serving` | no | 7 | — | 0 | 7 | 0 |
| `ancestor` | **yes** | 3 | **3** | 1 | 0 | 2 |
| `shared-ingredient` | no | 3 | — | 0 | 3 | 0 |
| `diaspora` | **yes** | 2 | **2** | 0 | 0 | 2 |
| **TOTAL** | **5** | **96** | **5** | **1** | **91** | **4** |

**Self-contradicting: 5 of 5 directional pairs.** **Likely wrong: 4 of 5.**

### The 5 directional pairs

| pair | reason | row matching reason (**KEEP**) | verdict |
|---|---|---|---|
| `ancestor` · `shawarma ↔ tacos-al-pastor` | *"Al pastor derives from Levantine shawarma…"* | `shawarma → tacos-al-pastor` | `single_tertiary_source` — the claim is supported by one tertiary source (Wikipedia *Al pastor*); **not independently corroborated** |
| `ancestor` · `bacalhau-a-bras ↔ vindaloo` | *"Portuguese carne de vinha d'alhos is the direct ancestor of vindaloo"* | `bacalhau-a-bras → vindaloo` | **likely_wrong** — the vindaloo ← *carne de vinha d'alhos* derivation *is* well sourced, but *carne de vinha d'alhos* is **pork in garlic wine vinegar** and *bacalhau à brás* is **salt cod** |
| `ancestor` · `biryani-hyderabadi ↔ jollof-rice` | *"Biryani's Persian-layered rice tradition is the documented ancestor of jollof"* | `biryani-hyderabadi → jollof-rice` | **likely_wrong** — Wikipedia *Jollof rice* attributes the origin to the Wolof/Jolof Empire and thieboudienne in Senegal; no biryani → jollof derivation appears |
| `diaspora` · `shawarma ↔ hamburger-american` | *"Doner kebab's diaspora to Berlin inspired the hamburger-among-immigrants"* | *(none — the reason names a third dish)* | **likely_wrong** — the claim is right but the relation connects `shawarma`; `doner-kebab` exists with **zero** relations. **Quarantine only — a rewire would be a new claim** |
| `diaspora` · `tonkatsu ↔ wiener-schnitzel` | *"Tonkatsu is the Japanese adaptation of European breaded cutlets"* | `tonkatsu → wiener-schnitzel` | **likely_wrong** — the supporting quote is for **French *côte de veau***; the schnitzel line descends from Nuremberg/Vienna, a different ancestry |

### The 91 symmetric pairs

Their reasons are **descriptive and non-directional** (*"Both slow-stirred rice dishes that release starch for a creamy texture"*). Direction carries no claim, so there is nothing to contradict.

They are **`unverified`** — not wrong, but with **no evidence attached and no way to attach it**: `dish_relations` has no source column and there are **0** relation-level citations. This is a blind spot in GUS-011's catalog-wide Wikipedia-only finding: the relation graph has zero evidence, and the schema cannot change that.

---

## 2. Quarantine list — 4 pairs

**Definition:** `unverified` and **excluded from the public view**. Not deleted, not edited, not rewired.

| # | pair | relation_type | why quarantined | proposed action |
|---|---|---|---|---|
| Q1 | `bacalhau-a-bras ↔ vindaloo` | `ancestor` | wrong source dish — the reason names *carne de vinha d'alhos* (pork in garlic wine), not *bacalhau à brás* (salt cod) | quarantine; the correct ancestor dish is **not in the catalog** |
| Q2 | `biryani-hyderabadi ↔ jollof-rice` | `ancestor` | unsupported — jollof's origin is the Wolof/Jolof Empire / thieboudienne | quarantine; needs a new claim under GUS-027/028 |
| Q3 | `shawarma ↔ hamburger-american` | `diaspora` | mis-wired — the claim describes `doner-kebab` → `hamburger-american` | quarantine only; **a rewire to `doner-kebab` would be a NEW claim**, not a correction |
| Q4 | `tonkatsu ↔ wiener-schnitzel` | `diaspora` | unsupported pairing — the supporting quote is for French *côte de veau*; schnitzel descends from a different line | quarantine; the *côte de veau* ancestor is **not in the catalog** |

**Not quarantined:** `shawarma ↔ tacos-al-pastor` (the pilot pair) — its *claim* is supported by one tertiary source. Its **stored pair** is self-contradicting and is resolved by Option B keeping the reason-matching row.

**Both rows of all 4 quarantined pairs are quarantined together** — a pair is one relation, and half of a contradiction is worse than none.

**Quarantine mechanics (proposed):** a `status` column on `dish_relations` (`verified` | `unverified` | `quarantined`), or a `dish_relations_quarantine` table. The API read path filters quarantined rows out. **No hand edits to `reason`, `from_dish_id`, or `to_dish_id`** — the mis-wiring is the evidence of the defect and must be preserved for the audit trail.

---

## 3. Option B migration plan

**Decision:** Option B — one directed row per relation, inverse derived. With a **relation_type vocabulary table** (not a CHECK enum) and a **`symmetric` flag**.

### 3.1 Schema changes

```sql
-- (a) relation_type vocabulary TABLE (not a CHECK enum, so new types can be
--     added without a schema migration, and so a type can carry metadata)
CREATE TABLE relation_types (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug        text NOT NULL UNIQUE,     -- 'ancestor', 'diaspora', 'family', ...
  name        text NOT NULL,
  -- symmetric = the relation holds equally in both directions.
  -- FALSE for directional types (ancestor, diaspora): storing both
  -- directions would assert a contradiction.
  symmetric   boolean NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- (b) dish_relations gains the FK + the symmetric flag + a status
ALTER TABLE dish_relations
  ADD COLUMN relation_type_id uuid REFERENCES relation_types(id),
  ADD COLUMN symmetric         boolean NOT NULL DEFAULT true,
  ADD COLUMN status            text NOT NULL DEFAULT 'unverified';
-- status enum: 'verified' | 'unverified' | 'quarantined'
-- NOTE: no source_id / claim_id here — that is sequenced into GUS-027/028.

CREATE TABLE dish_relations_quarantine (
  relation_id uuid PRIMARY KEY REFERENCES dish_relations(id) ON DELETE CASCADE,
  reason      text NOT NULL,     -- why it was quarantined
  raised_at   timestamptz NOT NULL DEFAULT now(),
  raised_by   text NOT NULL
);
```

**Why a vocabulary table rather than a CHECK enum:** a CHECK enum hard-codes the vocabulary into the schema, so adding a type needs a migration, and a type cannot carry metadata (like `symmetric`). The `symmetric` flag is the whole point — it is what makes the stored-pair pattern *safe* for symmetric types and *forbidden* for directional ones. In a vocabulary table the flag is data, reviewable and changeable without touching the schema.

### 3.2 The `symmetric` flag values

| relation_type | symmetric | meaning | stored today |
|---|---|---|---|
| `family` | **true** | both dishes are in the same family | 52 pairs |
| `regional-cousin` | **true** | kin across regions | 15 pairs |
| `shared-method` | **true** | they share a cooking technique | 14 pairs |
| `similar-serving` | **true** | eaten in similar contexts | 7 pairs |
| `shared-ingredient` | **true** | they share a defining ingredient | 3 pairs |
| `ancestor` | **FALSE** | `from` is the ancestor of `to` | 3 pairs |
| `diaspora` | **FALSE** | `from` is the origin, `to` the diaspora | 2 pairs |

### 3.3 Migration steps

**Step 0 — pre-flight.** Snapshot (`scripts/hermes/gus-014-pilot-snapshot.sh snapshot`) + verify the live DB matches the baseline. Run the whole migration on a **copy** first, as the GUS-014 pilot did.

**Step 1 — vocabulary table.** Create `relation_types`, seed the 7 live types with their `symmetric` values. Backfill `dish_relations.relation_type_id` by slug join.

**Step 2 — decide the surviving row for every pair.**

- **Directional pairs (5):** keep **the row whose `from_dish_id` is the dish the reason text names as the source**; delete the reverse row.
  - `shawarma → tacos-al-pastor` (pilot pair)
  - `bacalhau-a-bras → vindaloo`
  - `biryani-hyderabadi → jollof-rice`
  - `tonkatsu → wiener-schnitzel`
  - `shawarma → hamburger-american` *(kept for structural consistency, but quarantined — see §2)*
- **Symmetric pairs (91):** the direction carries no claim, so it is a **storage convention**, not a fact. Keep the row with the lower `from_dish_id` (deterministic), delete the other. The inverse is derived.

**Step 3 — quarantine.** Insert the 4 quarantined pairs into `dish_relations_quarantine` and set `dish_relations.status = 'quarantined'` for their surviving rows. **No edit to `reason`, `from_dish_id` or `to_dish_id`.**

**Step 4 — derived inverse.** A view exposing the symmetric relation of every non-quarantined row:

```sql
CREATE VIEW dish_relations_symmetric AS
SELECT r.id, r.from_dish_id, r.to_dish_id,
       r.relation_type_id, r.symmetric, r.reason, r.strength, r.status
FROM dish_relations r
WHERE r.status <> 'quarantined'
UNION ALL
SELECT r.id, r.to_dish_id, r.from_dish_id,
       r.relation_type_id, r.symmetric, r.reason, r.strength, r.status
FROM dish_relations r
WHERE r.status <> 'quarantined' AND r.symmetric;
```

**Note:** the inverse is emitted **only for symmetric types**. For a directional type the inverse is not a valid assertion — emitting it would recreate exactly the contradiction this migration removes.

**Step 5 — read-path update.** Re-point the API relation query at `dish_relations_symmetric`, filtered to `status <> 'quarantined'`.

**Step 6 — enforcement.** A trigger or a view-level rule that **rejects** a `symmetric = false` relation whose inverse also exists — so the self-contradiction cannot be reintroduced by a future write:

```sql
CREATE OR REPLACE FUNCTION check_relation_not_self_contradicting() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM dish_relations r
    JOIN relation_types rt ON rt.id = r.relation_type_id
    WHERE rt.symmetric = false
      AND r.from_dish_id = NEW.to_dish_id
      AND r.to_dish_id = NEW.from_dish_id
      AND r.relation_type_id = NEW.relation_type_id
      AND r.id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'directional relation % would assert both % -> % and % -> %',
      NEW.relation_type_id, NEW.from_dish_id, NEW.to_dish_id,
      NEW.to_dish_id, NEW.from_dish_id;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
```

**Step 7 — verify.** Re-run the audit: expect **0 self-contradicting pairs**, **96 rows**, and the same 4 quarantined pairs. Verify the public relation view returns the expected dish sets.

**Step 8 — provenance.** Every write in steps 2–3 logs an `edit_history` row (comment `GUS-224 relations Option B`) and bumps `updated_at` on every touched dish — the same discipline as the GUS-014 pilot.

### 3.4 What is explicitly NOT in this plan

- **No `source_id` / `claim_id` on `dish_relations`.** Sequenced into **GUS-027** (source registry) and **GUS-028** (claim-level citations), per Alejandro's decision. The `status` column here is a quarantine mechanism, not an evidence model — a relation is `unverified` until GUS-027/028 can attach a claim.
- **No rewiring.** No `from_dish_id` / `to_dish_id` is changed to a different dish. The mis-wired pairs are quarantined, not corrected.
- **No reason text edits.** The `reason` is the writer's claim; editing it would erase the evidence of the defect.
- **No relation writes for the other 118 dishes.** The 118-dish run writes **dimensions only** — so it is **not blocked by GUS-224**.

---

## 4. Sequencing — GUS-224 does **not** block the 118-dish run

The 118-dish dimension run writes **dimensions only** — `dish_family`, `dish_cuisine`, `dish_course`, `dish_technique`, `ingredient_category`, `dish_tradition`, `dish_context`. It writes **no relations**.

Therefore GUS-224 is **not** a blocker for the 118-dish run, and the two can proceed independently. GUS-224 remains blocked only on Alejandro's approval of this plan.

**One interaction to note:** the pilot's relation pair (`shawarma ↔ tacos-al-pastor`) is self-contradicting as stored. If the 118-dish run happens **before** Option B is applied, that contradiction remains live in the catalog. It is a known, documented defect with a recorded decision — not a silent one — so the dimension run is unaffected. Applying Option B first is cleaner but not required.

---

## 5. Open questions for Alejandro

1. **Should the pilot's own relation be quarantined too?** Its claim has one tertiary source, but it is *not* contradicted — unlike the other 4. Current plan: **keep it**, since the claim stands on its (single) source and the structural problem is solved by Option B.
2. **Quarantine semantics:** a `status` column on `dish_relations` (proposed) vs. a separate `dish_relations_quarantine` table (also in the plan). The column is simpler; the table preserves the audit trail. The plan currently has **both** — is that right, or pick one?
3. **Symmetric-pair canonical direction:** "lower `from_dish_id`" is deterministic but arbitrary. Alternatives: lower `slug`, or the row with the higher `strength`. Any preference?
4. **Should quarantined rows be visible to admins?** The plan excludes them from the public view only.
