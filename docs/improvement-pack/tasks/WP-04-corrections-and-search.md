# WP-04 · Corrections link and search in the hero

**Owners:** Claude Code (UI), Codex (endpoint). Cross-review.

## Why (evidence)
- 1,353 dish pages carry an "unevidenced" banner that asks readers not to trust them, but offer no way to help.
- Search is the strongest feature (typo-tolerant; returns dishes, families and lineages) but sits behind an icon.
- Search results include empty "ingredient" and "place" groups.

## Discovery
- Does the existing moderation or drafts system (contributor drafts reviewed by moderators) have a model for suggestions? Reuse it rather than adding a new store.
- Is there any anti-spam already (rate limit, honeypot)?

## Change
- **"Suggest a source or correction"** on every dish page. Prominent inside the "unevidenced" banner, smaller elsewhere. Short form: what's wrong or missing (required), source URL (optional), email (optional). Prefill dish slug and page URL. No account required.
- Submissions enter the moderation queue. Rate limit per IP plus a honeypot field. The confirmation tells the visitor the suggestion goes to review before anything changes.
- Hermes posts a daily count of new suggestions to Telegram; contents stay in the admin, not in chat.
- **Home hero search:** a visible input with three example links (e.g. "rendang", "dumplings", "noodle soup"). Results page hides empty groups.

## Done when
`--wp WP-04` all PASS. A test suggestion submitted on staging appears in the moderation queue; a second immediate submission is rate-limited.

## Gate
Any new table or migration: Codex writes the migration file; Alex approves before it is applied.
