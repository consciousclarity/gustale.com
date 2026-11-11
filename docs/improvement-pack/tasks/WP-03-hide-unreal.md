# WP-03 · Hide what isn't real

**Owner:** Claude Code. **Reviewer:** Codex. **Needs decisions:** D1 (view counts), D2 (languages), D3 (Add a dish / Recipes links).

## Why (evidence)
- Dish pages show "No detailed steps recorded yet", "Variants 0", "Contributors 0" and "3 edits · 0 contributors".
- Every dish shows 1,812–2,900 views, including 1,353 dishes added on 2026-10-30.
- "Add a dish" goes to gustale.recipes, which has 0 recipes and no submission form.
- `/es/dishes/feijoada` translates only the description; headings, navigation and sources stay English. A banner on dish pages offers Bahasa Indonesia.
- Cards on `/dishes` show the label "published" to visitors.

## Change
- Render a field only when it has a value: Preparation, Variants, Contributors, edit counts.
- Remove the "published" status label from public cards.
- Apply D1, D2 and D3 as decided. Default if Alex hasn't decided: hide the view counts, hide the language switcher and banner, replace "Add a dish" with "Suggest a source or correction" (wired in WP-04), and hide the Recipes nav link.
- Header and footer use the same name for the same section ("History & connections").
- Keep the language routes and data; hide only the entry points.

## Done when
`--wp WP-03` all PASS on production. The reviewer confirms nothing was deleted from the data, only hidden in the UI.
