# WP-06 · Classify all 1,474 dishes

**Owners:** Codex (pipeline), Hermes/MiniMax M3 (proposals), Claude Code (sample review). **Input:** approved `docs/taxonomy.md` from WP-05.

## Pipeline (Codex writes it; nothing touches the database until the last step)
1. **Export:** read-only dump of every published dish (`slug, canonicalName, shortDescription, originName, about text, current family/method`) to `data/classify/input.jsonl`.
2. **Propose (MiniMax M3, batches of 25):** use the prompt below. Write to `data/classify/proposals.jsonl`. Validate against the JSON schema; re-ask a batch at most once on schema failure, then mark it `needs_human`.
3. **Second opinion on low confidence:** proposals with `confidence < 0.7`, or where the model's form disagrees with the existing family, go to Claude Code for a second pass. Record both answers.
4. **Sample review:** Claude Code reviews a random 10% (about 150) against the dish text. Report the error rate per facet. Above 10% wrong on form or course: fix the prompt or taxonomy and rerun step 2. Do not patch individual answers.
5. **Diff report for Alex:** counts per facet value, the 30 least-confident items, a list of dishes whose origin was normalised, and the sample error rates.
6. **Import (needs Alex's "import WP-06"):** Codex writes an idempotent import script that sets facets and marks each value `auto` with model and date. Back up the affected columns first. Dry-run output goes in the report.

## Prompt (MiniMax M3)
```
You classify dishes for a culinary atlas. Use only the allowed values below.
If the text does not support a value, use null. Never guess an origin that is not in the text.
Return one JSON object per dish, exactly matching the schema. No commentary.

ALLOWED VALUES:
<paste form / course / method / main_ingredient / diet_flags lists from docs/taxonomy.md>

SCHEMA:
{"slug": str, "form": str|null, "course": [str], "method": [str], "main_ingredient": [str],
 "diet_flags": [str], "origin_country_iso2": str|null, "origin_subregion": str|null,
 "also_eaten_in_iso2": [str], "confidence": number 0..1, "evidence": str (≤20 words quoted from the input)}

DISHES:
<25 input records>
```

## Visitor-facing labelling
Auto-classified values show a small "auto-classified" marker on the dish page (WP-07) until a human confirms them. A confirmation is recorded per dish.

## Done when
`--wp WP-06 taxonomy-coverage` PASS (≥95% on form and method). Sample error rate under 10% per facet, recorded in `reports/wp-06-classification.md`.

## Cost note
Around 60 MiniMax calls for proposals and about 300 dishes for Claude second opinions. Fits within normal budget; Hermes logs actual token use in the report.
