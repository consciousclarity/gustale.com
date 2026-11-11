# WP-07 · Dish page v2 template

**Owner:** Claude Code. **Reviewer:** Codex. **Input:** approved `docs/dish-page-v2.md` (WP-05).

## Change
- Build the v2 template from the approved wireframe. Each block reads optional fields and renders nothing when they're empty.
- Data fields that don't exist yet (facts box details, how it got here, relatives with notes, how it's eaten, structured sources): Codex adds them as nullable fields through a migration file. Alex approves applying it.
- Inline numbered citations: each source has `url, title, publisher, accessed date, type (primary/secondary/tertiary)`. Wikipedia is tertiary.
- "Auto-classified" marker on facets whose value came from WP-06 without human confirmation.
- Phone: hero no taller than 45% of the viewport; description visible without scrolling; 44px minimum touch targets in the page body; body text at least 16px; labels at least 12px.
- Accessibility: skip link, one H1, landmarks, alt text that describes the image (not the photo credit), visible focus.
- JSON-LD on every dish page (`Recipe` is wrong for an encyclopedia entry; use `Article` with `about` a `Thing`, plus `BreadcrumbList`).
- Pilot on 10 dishes that WP-08 fills first.

## Done when
- `WP-05 mobile-description-above-fold` PASS on production.
- Lighthouse accessibility ≥ 95 on 3 pilot dishes (report attached).
- The reviewer confirms that an unevidenced dish renders cleanly with only the old fields filled.
