# WP-09 · Lineages: fix, link from dishes, define confidence

**Owners:** Claude Code (pages, copy), Codex (data links). Cross-review.

## Why (evidence)
- 14 lineages; two have 0 dishes (Preserved Fish, Wrapped Leaf). "Preserved Fish" is labelled Documented anyway.
- "1 dishes" pluralisation bug.
- Confidence labels (Documented, Likely related, Possible influence) are never defined.
- No dish page links to a specific lineage (checked: gyoza, jiaozi, ramen-japanese).
- Membership errors: Pad Thai, a stir-fry, is mapped as a noodle-soup adaptation. Filled Dough and Stuffed Pasta overlap without explanation.
- The sitemap lists 12 lineages; the API has 14.

## Change
1. **Confidence definitions page** (`/about/confidence`), linked from every label:
   - *Documented:* at least two independent sources describe the transmission directly.
   - *Likely related:* shared form and technique with plausible contact (trade, migration), but no direct record.
   - *Possible influence:* a hypothesis some sources propose; evidence is thin or disputed.
   The label belongs to each link between dishes, not only to the whole lineage.
2. **Membership audit:** Claude Code reviews each lineage's dishes against its concept summary, using the WP-06 facets. Propose adds and removals in a table for Alex. Empty lineages: fill them or hide them.
3. **Dish → lineage link:** every member dish shows "Part of: <lineage name> →" in the Relatives block (WP-07) or, before WP-07, under the definition.
4. **Fix** pluralisation and the sitemap count.

## Done when
`--wp WP-09` all PASS. Alex has approved the membership table.
