# Sourcing throughput: the measured rate, and the total

**Measured:** 2026-11-11 · **Pilot:** `docs/SOURCING-PILOT-BATCH-1.md`

## The rate, measured not estimated

Batch 1 was **3 ingredients × 2 countries = 6 pairs, 22 rows**. Two
researchers worked it in parallel and **neither wrote the document**;
both ran out of iteration budget. The document was assembled and
verified from their evidence.

| the work | the measured cost |
|---|---|
| researcher 1 | 637.77 s, 50 API calls, **0 pairs written** |
| researcher 2 | 837.01 s, 50 API calls, **0 pairs written** |
| parent: extract, cross-check, write, verify | the document, 22 rows, 33 URLs verified |
| **the correction pass** (the owner's six fixes) | **29.4 min** of fetching, 6 rows changed, 3 claims withdrawn |

**The two researcher runs together are 1,474.78 s — about 24.6 minutes
— and produced 0 written pairs.** They produced the *evidence*, which
is the expensive part, and the parent turned that evidence into rows.

**So the honest rate for the research itself is roughly 25 minutes of
researcher wall-clock per 6 pairs**, and **about 30 minutes per pair
including the parent's assembly and verification.**

## Why the delegation underperformed, and what it changes

Both researchers exhausted their budget on **toolchain setup**, not on
research: `web_search` was broken (Firecrawl failing), and each spent
calls discovering that `r.jina.ai` bypasses cookie walls, that Tokopedia
returns *"produk nggak ditemukan"* when its data request is blocked,
and that Edeka's search is client-side.

**The method is now written down** — in `docs/SOURCING-RESEARCH-CONTRACT.md`
§3 and the pilot document §3.1 — so the next researcher inherits it
instead of rediscovering it. That is the single biggest lever on the
schedule, and it is already paid for.

**The second lever is the BPOM API.** The import question took 11
queries by hand. `cekbpom.pom.go.id`'s DataTables endpoint answers it
in one, with a CSRF token and a session cookie, and it returns the
registration number, the manufacturer and the importer — which is
exactly the three facts the MD/ML distinction turns on. A researcher
that does not know this will spend the whole budget on retailer pages
and reach the wrong answer, because a marketplace listing cannot say
whether a product was made in the country.

## The total

The scoping correction matters here: the **sourcing tier is 250
markets**, not 302 (see `docs/SOURCING-COUNTRY-TIER.md`).

| | |
|---|---|
| ingredients | **30** |
| markets | **250** (the 249 ISO countries + Kosovo) |
| **ingredient × country pairs** | **7,500** |
| pairs per batch | 6 |
| **batches** | **1,250** |
| rows per batch | 22 |
| **total rows** | **27,500** |

### The time, at the measured rate

| the rate | per batch | 1,250 batches | working days |
|---|---|---|---|
| 25 min of researcher time per batch | 25 min | **521 hours** | **65 days** |
| 30 min including assembly | 30 min | **625 hours** | **78 days** |
| 60 min, with a verifier pass | 60 min | **1,250 hours** | **156 days** |

**65 to 78 working days of researcher time**, or 156 if every batch
also gets an independent verification pass — which the contract
requires, and which the pilot showed is what catches the errors.

**With three researchers in parallel: 22 to 26 working days.** With
five: 13 to 16 days.

### What that arithmetic says about the order of work

The tier is 250 markets × 30 ingredients. **Doing them one country at
a time is 30 batches of 250 pairs each — and a batch is 6 pairs**, so
a country at a time means 42 batches per country and every batch
re-learns the country's channels. **Doing them one ingredient family
at a time is 250 batches of 3 ingredients** — and each batch re-learns
the channels too, but 83 times instead of 250.

**Batching by ingredient family is 3× cheaper in channel-learning
overhead**, and it is also what makes the batch *reviewable*: a batch
of 6 pairs about one ingredient is a thing a human can check, and a
batch of 250 pairs about one country is not.

### The correction to the earlier estimate

The pilot document's own arithmetic said *"6 pairs per batch × 50
batches per ingredient"*, which was the **302** tier and did not count
the researcher's time at all. Both were wrong in the optimistic
direction. The corrected figures are above.

## What would change the schedule

| the lever | the effect |
|---|---|
| the written-down method (done) | removes the toolchain tax from every batch |
| the BPOM helper script (to write) | makes the import question one query, not eleven |
| a per-country channel note | the researcher stops rediscovering which retailers work there |
| **the owner's own sourcing judgement** | a country or an ingredient the owner can answer from knowledge removes that row from the research entirely |
| accepting a wider price band | a row that needs a price from a second retailer costs a second search; `unknown` does not |
| **not researching the 42 non-place rows** | already excluded by `docs/SOURCING-COUNTRY-TIER.md` |

**The biggest lever is the last one before it.** The owner knows things
the research cannot find — that gochujang is made in Indonesia by
Kikkoman's own Indonesian company, for instance, which the registry
confirms but which no retailer page would ever say. A single owner
answer can close a country row for an ingredient outright.

## What a batch actually costs, in one line

**~30 minutes of researcher time per 6 pairs, 1,250 batches, 65–78
working days for the full tier — 22–26 days with three researchers in
parallel.**
