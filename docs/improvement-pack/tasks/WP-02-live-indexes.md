# WP-02 · Indexes from live data, with a count gate

**Owner:** Codex. **Reviewer:** Claude Code.

## Why (evidence)
- Places: 36 countries summing to 100 dishes. The API has 1,474 dishes across 178 origins; Indonesia shows 14 on Places and has 193.
- Home says "123 food families"; the families page shows 22; dishes use 22. `/api/atlas/counts` reports `families: 123`, `places: 0`.
- The sitemap lists 12 lineages; the API has 14.
- Recorded history: deployed Astro SSG pages used mock API data because CI runners could not reach the live API through the VPS firewall. Hypothesis: Places, Families and Lineages are built from that mock data.

## Discovery (report before editing)
1. Which data source each of `/regions`, `/families`, `/lineages`, the home stats and the sitemaps uses at build time. Show the code path.
2. Confirm or reject the mock-data hypothesis by comparing the build's data with the live API.
3. How `/api/atlas/counts` computes `families` (123) and `places` (0). What does it count that the pages don't?

## Change (pick the option the discovery supports; propose it before building)
- **Option A — build where the API is reachable** (on the VPS, or CI using an allow-listed read-only endpoint). Needs Alex: firewall or CI changes.
- **Option B — snapshot export.** A read-only script on the API host writes `catalogue-snapshot.json` (dishes, origins, families, lineages, counts) to a location the build can fetch. The build uses only that file.
- Either way: remove mock data from the production build path. Mock data may remain for local development behind an explicit flag.
- **Count gate:** the build fails if page counts differ from the snapshot or API totals (dishes, origins, families in use, lineages), or if mock data is detected in a production build.
- Fix `/api/atlas/counts` so `families` means families in use and `places` means distinct origins with at least one dish. Or relabel the home stats so each number matches a page a visitor can open.
- Places lists all origins. Show "+ N more" instead of a silently truncated sample list.

## Done when
`--wp WP-02` all PASS on production, and a deliberately broken count (local test) fails the build.

## Gate
Any firewall, CI secret or server change needs Alex's yes before you make it.
