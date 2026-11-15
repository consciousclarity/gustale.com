# WP-10 · Data hygiene

**Owner:** Codex (scripts), Claude Code (review of each proposed change). **Every database change needs Alex's approval, per batch.**

## Findings to fix
1. **Duplicate names (10):** moussaka / moussaka-greek, goulash / goulash-hungarian, ceviche / ceviche-peruvian, hamburger / hamburger-american, paella / paella-valenciana, ramen / ramen-japanese, shakshuka / shakshouka, menemen / menemen-food, menudo (Mexican soup vs Filipino stew: legitimately different, so rename to disambiguate), and "Pancake" (the slug `sinasir` carries the name "Pancake", which looks like a naming error: rename it to Sinasir).
   - For each pair, propose merge (keep the richer record, redirect the other slug with 301) or disambiguate (rename and add the origin to the name).
2. **Origin normalisation:** map every `originName` to country plus optional sub-region or historical region (uses the WP-06 output). Countries become the primary filter.
3. **Image mismatches:** check every cover caption and alt text against the dish's origin (Feijoada shows a Portuguese dish on a Brazilian entry). Report mismatches; replace or caption honestly ("Portuguese feijoada à transmontana, a related dish").
4. **Caption debris:** strip photo credits, edit notes and "500th photo!" from alt text and card titles; keep credits in the credit field.
5. **Disputed origins:** mark hummus, falafel and others where sources disagree; the page shows "Origin disputed" with the competing claims (content written in WP-08).
6. **View counts:** apply D1, e.g. reset seeded counts to zero and start real counting.
7. **136 dishes without a cover:** list them; WP-08 fills the important ones.

## Method
Codex writes one script per finding that outputs a proposal CSV (`reports/wp-10-<finding>.csv`) and, separately, an idempotent apply script with a backup step. Claude Code reviews each CSV. Alex approves each apply ("apply WP-10 duplicates").

## Done when
`--wp WP-10`: duplicate-names PASS, view-counts-plausible PASS; covers may stay WARN.
