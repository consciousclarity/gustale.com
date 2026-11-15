# WP-08 · 100 Indonesian dishes to v2 standard

**Owners:** Hermes/MiniMax M3 (drafts), Claude Code (fact-check), Alex (spot-check and publish). **Needs D6** (licence and Wikipedia attribution).

## Why Indonesia first
It's the largest origin (193 dishes), the project is based in Bali, and local knowledge is where Gustale can beat a general encyclopedia.

## Selection
The 100 Indonesian dishes with the highest real traffic once analytics exists. Until then, a list Alex approves (Hermes proposes it from the 193).

## Per dish
1. **Research (MiniMax, with web access):** collect at least 3 candidate sources; at least 1 must not be Wikipedia (books, academic papers, Indonesian government or cultural heritage registers, reputable food writing). Save the fetched URLs and short quoted evidence (≤25 words each) in `content/drafts/<slug>/sources.json`.
2. **Draft (MiniMax):** fill the v2 fields. Every factual sentence in "How it got here" carries a citation number pointing to `sources.json`. Write in plain English; no marketing tone. Bahasa Indonesia native name and pronunciation.
3. **Fact-check (Claude Code):** re-fetch every cited URL; confirm each cited sentence is supported; flag unsupported sentences, overstated certainty and disputed origins. Output: `content/drafts/<slug>/review.md` with pass, fix or drop per sentence.
4. **Fix round (MiniMax):** apply the review. One round only; anything still failing gets removed.
5. **Images:** if the cover is missing or mismatched, generate with MiniMax image-01 in the documentary field-photography style, labelled AI-generated. Prefer a real licensed photo when one exists.
6. **Publish batch:** every 10 dishes, Hermes sends Alex a preview link and a one-line summary per dish. Alex spot-checks at least 2 per batch and replies "publish batch N".

## Rules
- No citation that wasn't fetched in this run. No invented page numbers.
- Don't copy Wikipedia sentences; write new text and cite.
- The confidence label ("Documented / Likely / Possible") follows the definitions page from WP-09.

## Done when
100 dishes published, each with at least 2 verified sources (one not Wikipedia), zero unresolved review flags. Tracked in `reports/wp-08-progress.md`.

## Effort
About 30–45 minutes of agent time plus 5 minutes of Alex's time per dish (assumed). Plan 10 batches over 3–4 weeks.
