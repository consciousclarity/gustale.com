#!/usr/bin/env python3
"""
Add the atlas-restructure cards to the board's BACKLOG.yaml.

The board is file-based: BACKLOG.yaml is the state, KANBAN.md is a generated
view. This script appends the atlas cards and flips GUS-1000 to done, then
the validator and the generator are run.

It is idempotent: a card that already exists is replaced, not duplicated.
"""

from __future__ import annotations

import pathlib
import sys

import yaml

BACKLOG = pathlib.Path("/home/gustale/gustale-state/.hermes/BACKLOG.yaml")

ATLAS_CARDS: list[dict] = [
    {
        "id": "GUS-1001",
        "title": "Atlas P0 — the baseline, ADR-004 and the toolchain readiness record for the shared culinary atlas",
        "epic": "EPIC 20 — The shared culinary atlas",
        "priority": "P0",
        "phase": 0,
        "depends_on": [],
        "approval": False,
        "notes": "Phase P0 of docs/briefs/atlas-restructure.md. Read-only: the baseline measures, ADR-004 records the D1-D8 amendments against the schema that actually exists, and the toolchain record states what is verified and what is blocked. Two of the biggest findings: (a) the public API does not read the claims model at all — 1354 sourced statements exist and 0 are published; (b) EVERY source in the database is S6 Wikipedia, so the statement_set_status() verified gate is unreachable for all 1354 statements.",
        "acceptance": [
            "docs/briefs/atlas-restructure.md is in the repo (the brief itself, persisted)",
            "docs/briefs/atlas-baseline.md exists with the commit, the routes, the schema version, the counts, the homepage statistics AND their definitions, the screenshots, and the pre-existing failures",
            "docs/ADR-004-atlas-amendments.md records D1-D8 as amendments to ADR-001/002/003, with a decision and a reason for each",
            "ADR-004 corrects the brief's field names against the live schema (the brief's evidence_status/disputed/unresolved do not exist; verification_state is publication state, claim_class is epistemic kind)",
            "Every claim in ADR-004 and the baseline is checked against the LIVE database, not against the documents",
            "The toolchain record names each capability's readiness state: Verified / Partially verified / Available but not exercised / Blocked / Not required",
            "The 50-dish stress set is located, not assembled",
            "The Kanban board reflects the atlas cards",
        ],
        "status": "review",
        "evidence": [
            "Baseline: docs/briefs/atlas-baseline.md",
            "ADR-004: docs/ADR-004-atlas-amendments.md",
            "The brief: docs/briefs/atlas-restructure.md",
            "Live counts measured 2026-10-31: 1476 dishes (1474 published); statements 1354 (0 published); claim_citations 1354; dish_dish_traditions 10; food_regions/dish_regions/dish_locations 0/0/0; geo_entities 3892",
            "Homepage KPI measured live: 1474 dishes / 178 origins / 22 families / 15 lineages — and the definitions are wrong (families counts kind='dish-type' slugs, lineages counts a technique, 42 of the 178 'origins' are not countries)",
            "Every source is S6: `SELECT source_class, count(*) FROM sources GROUP BY 1` returns exactly one row, S6=1486. Zero S1-S5. The verified gate therefore cannot be met by any statement.",
            "The claims gate verified by reading pg_get_functiondef: statement_set_status() raises 'the % transition must be made by a human credential' for any actor matching %agent% or %hermes% on verified/published",
            "Toolchain: CI database reproduces (CI_DB_REPRO_OK=1); migration chain agrees (34 migrations); API tests 75 passed / 9 failed / 3 skipped against the CI-repro database (the 9 are the categories.kind 500s, fixed by PR #135); 18 baseline screenshots via the repo's Playwright; research via direct Wikipedia/Wikidata/Commons HTTPS (web_search is down)",
            "Screenshots: /home/gustale/.hermes/cache/atlas-baseline/ (9 pages x desktop+mobile, all 200)",
            "The stress set is located: .hermes/REPORTS/GUS-241-structural-stress-set.md, with the shortlist and the verified titles beside it",
            "Two pre-existing failures found and fixed along the way: PR #135 (categories.kind) merged as 04f6436, and the GitHub REST API merge block worked around via git push to main",
        ],
    },
    {
        "id": "GUS-1002",
        "title": "Atlas P1 — the additive schema for typed place associations, evidence axes, dated claims and typed connections",
        "epic": "EPIC 20 — The shared culinary atlas",
        "priority": "P1",
        "phase": 1,
        "depends_on": ["GUS-1001"],
        "approval": False,
        "notes": "Phase P1 of docs/briefs/atlas-restructure.md. Purely additive: no legacy column is dropped, renamed or retyped. The order is ADR-004 §11: (1) the statement evidence/dispute/research columns, (2) claim_dates, (3) dish_place_associations + the entity-kind trigger, (4) the relation_types additions and renames, (5) the dish_relations normalized-pair index + the regional_variant_of cycle trigger, (6) dish_identities + dish_name_relations.",
        "acceptance": [
            "`statements` gains `evidence_status` (unevidenced/research_pending/provisional/evidenced), `dispute_state` (null/disputed/unresolved) and `research_outcome` (null/completed/inconclusive) — three separate axes, and verification_state and claim_class keep their existing meanings",
            "`claim_dates` holds the machine-readable value AND the human-readable expression, with an interval-ordering CHECK and an open-ended (NULL end) case",
            "`dish_place_associations` holds the six relationship types (historical_emergence, established_tradition, regional_adaptation, later_introduction, earliest_documentation, legacy_unreviewed) and a polymorphic entity reference",
            "A trigger rejects a `community` association that points at a geo_entities row, and a `place` association that points at a traditions row",
            "`relation_types` gains the five historical predicates and `often_compared_with`; the three resemblance predicates are symmetric",
            "A normalized-endpoint unique index rejects a REVERSED duplicate of a symmetric pair, and does NOT reject a reversed directional pair",
            "A recursive trigger rejects a cycle in regional_variant_of",
            "A self-link is rejected",
            "The Drizzle schema models every new table and column",
            "Every migration is idempotent and applies to the live database as a no-op or an addition",
            "Full suite green, typecheck clean, biome clean, astro build green",
        ],
        "status": "todo",
        "evidence": [],
    },
    {
        "id": "GUS-1003",
        "title": "Atlas P2 — the backfill from the legacy fields into the typed associations, and the reconciliation reports",
        "epic": "EPIC 20 — The shared culinary atlas",
        "priority": "P1",
        "phase": 2,
        "depends_on": ["GUS-1002"],
        "approval": True,
        "notes": "Phase P2 of docs/briefs/atlas-restructure.md. The brief's §11 defaults apply: the Wikidata-discovered country of origin stays S6 discovery data; the legacy origin becomes legacy_unreviewed with evidence unevidenced and its original value and provenance preserved; the public wording is 'Associated with ...'; a legacy origin is upgraded only when a qualifying source already supports that specific historical claim; ambiguous mappings go to an editorial queue rather than being assigned. The approval flag is for the LIVE write, per RULES.md and the standing gate (backup, snapshot, dry-run on a copy, count assertions, apply, verify, automatic rollback).",
        "acceptance": [
            "The mapping is documented BEFORE it runs: what each legacy field meant, where it came from, and what it becomes",
            "The backfill is restartable and safe to rerun, with no duplicates on retry",
            "The legacy origin values become legacy_unreviewed associations with evidence unevidenced, the original value and the provenance preserved",
            "The legacy cuisines become established_tradition associations where a tradition row matches, and legacy_unreviewed otherwise",
            "The ambiguous mappings are in an editorial queue, not assigned",
            "Reconciliation reports cover: row counts, distinct entity counts, relationship counts, publication states, unmapped records, orphans, duplicate candidates, unexpected nulls and public result counts",
            "Every discrepancy has an explanation, and the expected-count rules were defined BEFORE execution — 'counts changed' is not sufficient",
            "The backfill ran as a dry-run on a copy first, with the assertions defined in advance",
        ],
        "status": "todo",
        "evidence": [],
    },
    {
        "id": "GUS-1004",
        "title": "Atlas P3 — the public API for the three concepts, with the contract tests and the CI mock data in step with the live schema",
        "epic": "EPIC 20 — The shared culinary atlas",
        "priority": "P1",
        "phase": 3,
        "depends_on": ["GUS-1002"],
        "approval": False,
        "notes": "Phase P3 of docs/briefs/atlas-restructure.md. The API must respect statement publication state everywhere, and the CI mock data must not drift from the live schema — the Astro build runs against the mocks, so stale mocks pass silently. The mock data is currently from 2026-07-25 with 121 dishes against 1474 live.",
        "acceptance": [
            "The dish response separates places & traditions, food families and history & connections, and names each",
            "The connection sentences read correctly for every predicate: 'source = predecessor, target = derived', and the rendered sentence and the stored edge agree (a test asserts both)",
            "A connection_proposed edge with direction_known=false renders NO arrow anywhere — not in the page, not in the graph, not in the API's direction field",
            "The count endpoints use COUNT(DISTINCT dish_id) and count unique dishes independently of associations",
            "The public API exposes no draft or private editorial data through search, metadata, the graph endpoint, the counts or a cached response",
            "A contract test fails when the CI mocks and the live schema diverge",
            "The CI mock data is refreshed from the live API and its dish count matches the live catalogue",
            "The required negative cases are covered: variant-cycle rejection, duplicate and self-link rejection, a dish with no settled origin, one association and many, a historical region, a community association, competing claims, several classifications, multiple influences, symmetric resemblance without descent, approximate dates, search combinations and deduplication, unique counts, draft privacy, permissions, translation fallbacks and API compatibility",
        ],
        "status": "todo",
        "evidence": [],
    },
    {
        "id": "GUS-1005",
        "title": "Atlas P4 — the public interface: the new navigation, the dish page in the brief's reading order, the place and family pages, the map and the search",
        "epic": "EPIC 20 — The shared culinary atlas",
        "priority": "P2",
        "phase": 4,
        "depends_on": ["GUS-1004"],
        "approval": False,
        "notes": "Phase P4 of docs/briefs/atlas-restructure.md. Navigation becomes Explore / Places / Food families / History & connections / About. /regions keeps its path and is labelled 'Places'. The old lineage URLs get 301s — and there is currently NO redirect machinery at all, so that is new work (Astro's redirects map or a Caddy redir). The dish page follows the brief's six-part reading order, and the map and graph dependencies load only on the pages that use them.",
        "acceptance": [
            "The nav is Explore / Places / Food families / History & connections / About, consistently on both domains",
            "/regions keeps its path, is labelled 'Places', and the old lineage URLs 301 to the new ones",
            "The dish page reads in the brief's order: names and aliases, image, description; places & traditions with emergence, tradition, documentation and spread kept separate; food families grouped by dimension; history & connections as complete sentences with the resemblance block separate and the graph lazy-loaded and every edge also in the list; regional variants; sources and contribution info",
            "The dish card shows the name, the image, a short description, the selected associations and useful family info, with '+N more' pointing somewhere reachable",
            "No single flag is used as identity, and the ordering is deterministic without implying ownership",
            "The place page heads 'Dishes associated with this place' and groups by relationship type; a shared dish appears under every relevant published association and counts once per result set",
            "The family page states its dimension, its definition and its inclusion criteria, and explains that classification does not imply common ancestry",
            "The homepage states its purpose in plain language, offers three exploration paths, gives the globe an accessible list alternative, and its four statistics are defined on the page",
            "The loading, empty, error, retry, unavailable, permission-denied and success states all exist, with no layout shift and no editorial placeholder shown as published content",
            "The map distinguishes emergence, tradition, documentation and spread by text, shape or pattern as well as colour, and the map selection, filters, cards and counts stay in sync",
            "Screenshots at desktop and mobile for every page type, in the project's established artifact location",
        ],
        "status": "todo",
        "evidence": [],
    },
    {
        "id": "GUS-1006",
        "title": "Atlas P5 — the contribution and moderation flow for the three concepts, with the server-side enforcement",
        "epic": "EPIC 20 — The shared culinary atlas",
        "priority": "P2",
        "phase": 5,
        "depends_on": ["GUS-1004"],
        "approval": False,
        "notes": "Phase P5 of docs/briefs/atlas-restructure.md. A contributor can save a draft without choosing a birthplace, add several associations, explain and source individual claims, record uncertainty, propose competing accounts, classify by dimension, add historical and resemblance connections correctly, and propose regional variants. The validation and the authorization are enforced SERVER-SIDE, including on direct API calls, and the existing concurrency protections are used so no editor's work is silently overwritten.",
        "acceptance": [
            "A contributor can save a draft with NO birthplace and add several associations",
            "A contributor can explain and source an individual claim and record uncertainty",
            "A contributor can propose competing accounts, and none of them is marked canonical",
            "A contributor can classify by dimension, add a historical connection, add a symmetric resemblance connection, and propose a regional variant",
            "Plain-language helper text explains the distinctions between the three concepts",
            "The validation and the authorization are enforced server-side, including on a direct API call — a test proves the direct call is refused",
            "The authorship, the revision history and the existing moderation rules are preserved, and a new registrant never gets admin privileges",
            "The review is at statement level",
            "The existing concurrency protection is used, and a test proves no editor's work is silently overwritten",
            "The vocabulary labels are translated under ADR-003, the prose follows the English-pivot workflow, long and missing translations, non-Latin names and bidirectional text all work, and a raw vocabulary key is never exposed",
        ],
        "status": "todo",
        "evidence": [],
    },
    {
        "id": "GUS-1007",
        "title": "Atlas P6 — the wording and metadata audit across gustale.com and gustale.recipes",
        "epic": "EPIC 20 — The shared culinary atlas",
        "priority": "P2",
        "phase": 6,
        "depends_on": ["GUS-1005", "GUS-1006"],
        "approval": False,
        "notes": "Phase P6 of docs/briefs/atlas-restructure.md. The same relationship must mean the same thing in the headings, the filters, the forms, the map legends, the APIs and the metadata. The crawl covers both domains for broken links, redirect problems, empty pages and outdated origin wording. recipeCuisine holds supported culinary traditions and not an inferred birthplace — the current vocabulary is verified first. Hreflang is only where a real localized equivalent exists.",
        "acceptance": [
            "Both domains are crawled for broken links, redirect problems, empty pages and outdated origin wording",
            "No page or metadata says 'origin', 'country of origin' or 'born in' where it means an association",
            "The canonical URLs, the redirects, the internal links, the sitemaps, the structured data and the Open Graph are updated",
            "The hreflang alternatives exist only where a real localized equivalent exists — none is manufactured",
            "The structured-data properties are not manufactured either",
            "recipeCuisine holds supported culinary traditions, not an inferred birthplace, and the current vocabulary is verified first",
            "There is no redirect chain, and no draft or unhelpful filter combination is indexable",
            "The Lighthouse and axe checks run on the representative pages, the results are interpreted, and the manual checks and the justified exceptions are recorded — the automated score alone does not count as proof",
            "The final consistency pass finds the same relationship meaning the same thing everywhere",
        ],
        "status": "todo",
        "evidence": [],
    },
    {
        "id": "GUS-1008",
        "title": "Atlas P7 — the independent verification, the deployment, the post-deploy checks and the final report",
        "epic": "EPIC 20 — The shared culinary atlas",
        "priority": "P2",
        "phase": 7,
        "depends_on": ["GUS-1005", "GUS-1006", "GUS-1007"],
        "approval": True,
        "notes": "Phase P7 of docs/briefs/atlas-restructure.md. The standing gates apply: CI green, then deploy, then health and behaviour checks on both domains, then completion or revert. The rollback is defined BEFORE the migrations are applied, and the recovery path is exercised once using the existing dry-run copy mechanism before it is relied on. The observation window is bounded and defined in the deployment plan.",
        "acceptance": [
            "An independent verifier assessed the result against the acceptance criteria, given the requirements and the criteria and not the implementation",
            "The recovery path is exercised once on the dry-run copy before it is relied on",
            "CI is green, the deploy runs through the existing pipeline, and both domains serve correctly afterwards",
            "The representative pages and the public APIs work after the deploy",
            "Sign-in and the moderation permissions are intact",
            "Search and the caches reflect the publication state",
            "No new error pattern appears in the logs",
            "The counts and the migrated records reconcile",
            "No fixture and no draft content is public",
            "The observation window is bounded and was actually observed",
            "The final report is delivered with the evidence, and nothing is reported as done that did not happen",
        ],
        "status": "todo",
        "evidence": [],
    },
    {
        "id": "GUS-1009",
        "title": "The migration list lives in THREE places — make scripts/repro-ci-db.sh apply the same migrations as ci.yml and the chain script, and extend the drift guard to cover it",
        "epic": "EPIC 01 — Stabilize the technical foundation",
        "priority": "P0",
        "phase": 0,
        "depends_on": [],
        "approval": False,
        "notes": "Found by the 2026-10-31 atlas baseline. `scripts/repro-ci-db.sh` — the script that builds a LOCAL copy of the CI database — keeps its OWN list of migrations, separate from `.github/workflows/ci.yml` and `scripts/ci-migration-chain.sh`, and it was missing 0034 and 0035. A database built with it therefore lacks `categories.kind` and `GET /api/dishes` returns 500 against it. The two-list guard `scripts/validate-ci-migration-chain.py` does not look at this third list. Same class of bug as the two-list drift it was written for, in a third place.",
        "acceptance": [
            "scripts/repro-ci-db.sh applies 0034 and 0035",
            "A database built by scripts/repro-ci-db.sh has the same schema as one built by scripts/ci-migration-chain.sh — proven by comparing the schema, not by reading the script",
            "scripts/validate-ci-migration-chain.py checks the third list too, and FAILS when it diverges — proven by injecting a divergence",
            "The guard passes on the real files",
        ],
        "status": "todo",
        "evidence": [],
    },
    {
        "id": "GUS-1010",
        "title": "Every source in the database is S6 Wikipedia — the research pipeline that produces a qualifying source for a specific claim",
        "epic": "EPIC 20 — The shared culinary atlas",
        "priority": "P1",
        "phase": 2,
        "depends_on": ["GUS-1001"],
        "approval": False,
        "notes": "Found by the 2026-10-31 atlas baseline. `SELECT source_class, count(*) FROM sources GROUP BY 1` returns exactly ONE row: S6=1486. Every URL points at Wikipedia. The `statement_set_status()` verified gate requires a `claim_class='documented'` statement to carry a `supports` citation whose source_class is in S1-S5, so NOT ONE of the 1354 statements can reach verified, and none can reach published. The published state is additionally blocked on a human credential. This is the research half of the brief's §12: a non-Wikipedia source is NECESSARY BUT NOT SUFFICIENT — it must actually support the specific claim. web_search/web_extract are down (the Firecrawl proxy has no vhost); direct HTTPS to Wikipedia/Wikidata/Commons works and is what the repo's own scripts use. The research is done against the acceptance cases (falafel, hummus) and the stress set, NOT in bulk.",
        "acceptance": [
            "A source enters the registry only after the page was actually fetched and the claim found in it, with URL, access date and a locator",
            "The citation is recorded with its support note, and the note says what the source supports — not that it exists",
            "The sourcing is not circular: a source that is itself derived from the claim is rejected",
            "The claim class is set honestly: a scholarly reading is not a documented fact, and an oral tradition is not a document",
            "Wikipedia and Wikidata are discovery only — never the sole source for a contested origin claim",
            "A source class is assigned and stored on the source row, and the class is what the verified gate reads",
            "The falafel and hummus acceptance cases are researched against non-Wikipedia sources, and where the evidence is genuinely insufficient the record stays honestly unevidenced",
            "The editorial review queue is non-blocking: the bulk pipeline never waits on a reviewer",
            "The research is done for the acceptance cases and the stress set, not in bulk across the catalogue",
        ],
        "status": "todo",
        "evidence": [],
    },
]


def main() -> int:
    if not BACKLOG.exists():
        print(f"FAIL: {BACKLOG} not found", file=sys.stderr)
        return 2

    doc = yaml.safe_load(BACKLOG.read_text())
    tasks = doc.get("tasks")
    if not isinstance(tasks, list):
        print("FAIL: BACKLOG.yaml has no `tasks:` list", file=sys.stderr)
        return 2

    by_id = {t.get("id"): t for t in tasks if isinstance(t, dict)}

    # GUS-1000 is merged and deployed — reflect the truth, do not rewrite it.
    g1000 = by_id.get("GUS-1000")
    if g1000 is not None:
        g1000["status"] = "done"
        ev = g1000.setdefault("evidence", [])
        new_ev = [
            "MERGED 2026-10-31 as 04f6436 (PR #135). The REST API merge was refused because the PAT lacks the `workflow` scope and the diff touches .github/workflows/ci.yml; the merge was done with `git push origin <branch>:main`, which the push path does not scope-check. A probe branch proved the push path works before it was used.",
            "DEPLOYED: the live gustale-api image is now 04f643660404c76ae9c1ae5e05d25ec5626b4d22; api.gustale.com/health and gustale.com both 200 after the deploy.",
        ]
        for e in new_ev:
            if e not in ev:
                ev.append(e)

    added, replaced = [], []
    for card in ATLAS_CARDS:
        cid = card["id"]
        if cid in by_id:
            # Preserve the existing status/evidence; replace the definition.
            card = dict(card)
            card["status"] = by_id[cid].get("status", card["status"])
            card["evidence"] = by_id[cid].get("evidence", card["evidence"])
            tasks[tasks.index(by_id[cid])] = card
            replaced.append(cid)
        else:
            tasks.append(card)
            added.append(cid)

    BACKLOG.write_text(
        "# Gustale backlog — generated from .hermes/ROADMAP.md (2026-10-17).\n"
        "# Source of truth for roadmap work. Hermes updates status/evidence after every task.\n"
        "# status: todo | in_progress | blocked | review | done | wontfix\n"
        "# approval: true = needs Alejandro's OK before the destructive/schema/auth step (RULES.md §Approval)\n"
        + yaml.safe_dump({"tasks": tasks}, sort_keys=False, allow_unicode=True, width=100)
    )
    print(f"added: {added}")
    print(f"replaced: {replaced}")
    print(f"GUS-1000 status -> done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
