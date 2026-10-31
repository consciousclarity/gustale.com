# Hermes implementation brief: Gustale's shared culinary atlas

**For:** Hermes, Gustale profile — gustale.com + gustale.recipes
**Mode:** Autonomous execution under `.hermes/RULES.md` and the standing gates.
**Required outcome:** Implemented, migrated, independently verified, polished and deployed work. A proposal, mockup or partially connected interface is not completion.

**Authorization** means what `.hermes/RULES.md` grants the gustale profile: autonomous mode plus the standing gates. Anything inside it needs no question. "Exceeds authorization" means only the escalation conditions in §16. Do not bypass approval mechanisms, authentication protections or deployment gates that exist in the tooling.

Continue independent work when a card is blocked.

**Persistence:** save this brief in the repo as `docs/briefs/atlas-restructure.md` (or the repo's established briefs location). `HANDOFF.md` references it, and you re-read it after every reset or context compression. Don't rely on conversation context.

---

## 1. Establish the authoritative context

Load first:

- `.hermes/RULES.md`, `STATUS.md`, `HANDOFF.md`, `KANBAN.md`
- ADR-001, ADR-002, ADR-003
- Applicable repository instructions and operational runbooks.

Locate missing files rather than inventing their contents. Identify the intended repository, checkout, database, hosting targets, board and environments.

This brief extends existing decisions. Existing ADRs remain authoritative except where D1–D8 below explicitly amend them. Record the amendments in ADR-004 before any live write. If ADR-004 already exists, use the next free ADR number and cross-reference this brief.

Verify actual table, column, enum, route and service names against the repository and environment. Previously reported names are not guaranteed current.

Create a baseline containing:

- Current commit and working-tree state.
- Public routes and important redirects.
- Schema version.
- Counts of dishes, places, classifications, associations, connections and published statements.
- Current homepage statistics and their definitions.
- Representative screenshots.
- Existing failures that predate this work.

Do not overwrite unrelated work.

## 2. Phases (in order)

| Phase | Content |
|---|---|
| **P0** | Baseline, ADR-004, Kanban cards, toolchain checks for P1 |
| **P1** | Additive schema |
| **P2** | Backfill and reconciliation |
| **P3** | API, contract tests, CI mock data |
| **P4** | Public UI, map, search |
| **P5** | Contribution and moderation |
| **P6** | Wording and metadata audit, both domains |
| **P7** | Verification, deployment, post-deploy checks, report |

A phase starts only when the previous phase's acceptance criteria are independently verified. Cards inside a phase may run in parallel where they don't touch the same files.

Legacy fields are not removed in this brief. Removal is a separate, later project.

## 3. Toolchain: verify what the next phase needs

Before each phase, verify only the tools that phase needs. Time-box each check. A blocked optional tool (for example Codex) is reported and routed around. It never blocks P1–P3.

Use read-only checks first. Never print tokens, credentials, connection strings or private configuration.

Readiness states: Verified · Partially verified · Available but not exercised · Blocked · Not required for this phase.

A configured integration or a successful version response does not establish end-to-end functionality.

**Kanban.** Use the existing Gustale board (its actual storage or service). Verify read, create, edit, move and read back with one clearly labelled, reversible test card, and confirm it persists. Map the workflow onto Backlog · Ready · In progress · Review · Done · Blocked (status or flag). Don't rename shared columns or replace the board. If an external board is unavailable, `KANBAN.md` is the continuity record, and you report the external board as blocked rather than verified.

Every implementation card includes: outcome, scope and dependencies, acceptance criteria, verification evidence, commit/PR, migration or deployment implications, and any remaining editorial work. A card moves to Done only when its acceptance criteria and independent verification are satisfied.

**Claude Code CLI and Codex CLI** (only if a phase will use them). For each tool:
- Run one bounded, non-interactive, read-only task against a repo file and check the answer independently.
- Capture the exit code.
- Confirm working-directory selection, timeouts, output capture and cancellation.

Record quota, billing or access blockers without exposing secrets. Don't change safeguards or persistent model settings to pass a check. Use these CLIs economically; they consume subscription quota.

## 4. Product principles

Three concepts stay separate in storage, API, editing, search, maps, navigation and public presentation:

1. **Places & traditions:** where and with whom a dish is associated, and how.
2. **Food families:** what kind of food it is.
3. **History & connections:** evidence-supported relationships between dishes.

Rules:

- Association does not imply exclusive ownership.
- Shared heritage does not imply equal evidence of invention.
- Earliest documentation does not establish birthplace.
- Similarity does not establish descent.
- Modern borders do not define historical culinary geography.
- Uncertainty is data.
- Never invent claims, citations, relationships, dates or geometry.
- Never infer ancestry from shared names, ingredients, shape, geography or category membership.
- No numerical confidence scores.
- Preserve supported specificity; don't replace it with vague wording to avoid disagreement.

## 5. Architecture decisions (record in ADR-004)

### D1. Cuisine and tradition become associations

ADR-001's `cuisine` and `tradition` dimensions describe where and who, not food classification.

- Migrate defensible memberships to `established_tradition` associations, preserving provenance, publication state and evidence state.
- Don't force every tradition into a geographic entity; represent communities and culinary traditions separately where needed.
- Ambiguous mappings go to editorial review and are not assigned automatically.
- Preserve published URLs through compatible views or redirects. Escalate only if neither is possible.

### D2. Remaining classification dimensions

| Dimension | Covers |
|---|---|
| `family` | form |
| `technique` | preparation |
| `course` | culinary role |
| `ingredient_category` | principal ingredient |
| `context` | where appropriate |

Don't add dimensions to mirror this brief's wording. Multiple memberships are allowed. Parent links stay within one dimension and cannot form cycles. Category pages state their inclusion criteria.

### D3. Typed place and community associations

Relationship types:
- `historical_emergence`
- `established_tradition`
- `regional_adaptation`
- `later_introduction`
- `earliest_documentation`
- `legacy_unreviewed` (migration only)

Rules:
- Support modern places, historical regions and cross-border areas without forcing them into one modern country.
- Each statement carries subject, relationship, entity, explanation, citations, qualifiers, provenance and review state.
- No historical "primary origin" field. Display ordering is presentation metadata and never implies evidentiary priority.
- Define valid entity combinations and enforce them server-side.

### D4. Evidence, disagreement and publication are separate

Keep existing evidence statuses and meanings:

| Status | Meaning |
|---|---|
| `unevidenced` | not yet researched |
| `research_pending` | queued |
| `provisional` | proposed |
| `evidenced` | qualifying non-Wikipedia sources attached |

`evidenced` is a project state, not proof that a claim is uncontested.

Add, without collapsing existing meanings:
- **Disputed:** competing sourced accounts exist.
- **Unresolved:** researched, answer genuinely unknown.

Prefer separate dispute and research-outcome fields over overloading the evidence status. If the schema forces another design, document the mapping in the ADR and lose no information.

Publication/moderation state stays distinct from evidence state. Competing accounts are separate statements, and none is marked canonical. A multi-place dish is not automatically disputed. Public badges are explained in plain language.

### D5. Typed dish connections

**Historical predicates:**
- `developed_from`
- `adapted_from`
- `influenced_by`
- `regional_variant_of`
- `connection_proposed`

**Stored convention:** source = predecessor, influence or broader dish; target = derived, influenced or variant dish. An `adapted_from` edge means "target was adapted from source." Document this in code, API docs, editor helper text and tests, and make public sentences match it.

For `connection_proposed`, record whether direction is known. Never render an ancestry arrow when it isn't.

**Resemblance predicates (symmetric):**
- `similar_form`
- `similar_technique`
- `often_compared_with`

Store each pair once with normalized endpoints.

**Enforce:**
- No self-links.
- No duplicates under the defined statement identity.
- No reversed duplicates for symmetric pairs.
- No cycles in `regional_variant_of`.

The influence network is not a tree. Uniqueness constraints must not discard legitimate parallel claims or citations.

### D6. Dates qualify specific claims

Keep these distinct:
- Surviving-record date.
- Proposed emergence period.
- Introduction date.
- Adaptation date.

Support approximate, bounded and open-ended dates. Store a machine-readable value plus a human-readable expression, and validate interval ordering. Never turn "before the thirteenth century" into an invented year.

### D7. Stable dish identity

Distinguish:
- Shared dish.
- Regional variant.
- Historically related dish.
- Alias, translation or transliteration.

Don't merge by name or split by national association. Preserve identifiers until editorial review resolves identity.

### D8. Published statements define public behavior

Public APIs, search, rendering, counts and caches consistently respect statement publication state. One disputed claim doesn't suppress unrelated published claims. No draft or private editorial data leaks through search, metadata, graph endpoints, counts or cached responses.

## 6. Roles and execution

| Role | Responsibility |
|---|---|
| **Orchestrator** | Sequencing, integration, Kanban, decisions, handoff |
| **Coder** | Implementation and focused tests |
| **Researcher** | Claim-specific source work |
| **Verifier** | Independent assessment |

Claude Code and Codex may fill roles after their check passes.

- Avoid concurrent edits to the same files; use isolated work areas where the workflow supports them.
- Give the verifier requirements and acceptance criteria before implementation details. It establishes expected behavior independently, then inspects the implementation and diff.
- Keep agent tasks bounded. Record files changed, checks run and open concerns.

Every phase ends with a `HANDOFF.md` checkpoint. Never store credentials in handoffs. The checkpoint contains:
- Commit and environment.
- Completed and active cards.
- Decisions and assumptions.
- Resume commands.
- Verification artifacts.
- Blockers.
- Next concrete action.
- A pointer to this brief.

## 7. Interface and visual system

Preserve Gustale's calm, editorial, credible identity. Improve the existing system and reuse its components and tokens; don't introduce a new brand. Audit typography, spacing, content widths, borders, badges, cards, imagery and responsive behavior.

**Navigation:** Explore · Places · Food families · History & connections · About. Keep `/regions` (labelled "Places") and `/families`; redirect old lineage URLs with 301s. Make the Atlas/Recipes distinction consistent, and make cross-domain link destinations clear.

**Homepage:**
- Plain-language purpose and three exploration paths.
- Globe with an accessible list alternative.
- Explicitly defined statistics: unique dishes are counted independently of associations.
- Resolve the reported country/place count inconsistency against live data. Don't label every geographic entity a country.

**Dish cards:**
- Name, established image treatment, short description, selected associations and useful family info.
- "Culinary traditions" only for tradition relationships; "Associated places" for mixed or legacy associations.
- "+N more" with an accessible destination.
- No single flag as identity. Deterministic ordering that doesn't imply ownership. Evidence badges without clutter.

**Dish pages, in this reading order:**
1. Names and aliases (ADR-003), image, description.
2. Places & traditions: emergence, tradition, documentation and spread kept separate. Competing accounts get equal readability while their evidence differences stay visible.
3. Food families, grouped by dimension.
4. History & connections, as complete sentences. Resemblance goes in a separate "Similar dishes" block. A graph appears only if it adds value; it loads lazily and every edge also appears in the list.
5. Regional variants.
6. Sources and contribution info.

Fit around recipe content on gustale.recipes without duplicating it.

**Place pages:**
- Heading "Dishes associated with this place" or similarly precise; group or filter by relationship type.
- Shared dishes appear under every relevant published association and count once per result set.
- Don't subordinate historical or cross-border regions to a modern country without a valid geographic relationship.

**Family pages:** dimension, definition, inclusion criteria and members. Explain that classification doesn't imply common ancestry. A few useful intersections, not a filter wall.

**Connection pages:** explain relationship types, direction, sourcing, proposed accounts and resemblance.

**Interaction states:** implement loading, empty, error, retry, unavailable, permission-denied and success states where relevant. No layout shifts, broken images, dead controls, endless spinners or blank sections. Never show editorial placeholders as published content.

## 8. Maps, graphs and geographic precision

- Several published associations per dish.
- Region geometry only when it's reliable and appropriately licensed; otherwise use labels and lists. No centroid pin as a precise-looking birthplace for a broad region.
- Distinguish emergence, tradition, documentation and spread by text, shape or pattern as well as color.
- Map selection, filters, cards and counts stay in sync. Dishes are deduplicated independently of marker counts.
- Keyboard use, text equivalents, reduced motion, mobile interaction without scroll traps.
- Map and graph dependencies load only on pages that use them.

## 9. Search, URLs and public metadata

**Index published:**
- Associations.
- Communities and traditions.
- Historical and cross-border regions.
- Names and aliases across supported languages.
- Classification dimensions.
- Connection types.

**Filters and results:**
- Filter "associated with" separately from "emerged in."
- OR within a dimension, AND across dimensions. Document this and test the combinations.
- Persist meaningful filter state in URLs; back/forward restores the interface.
- Deduplicate results and count unique dishes.

**Update:**
- Canonical URLs.
- Redirects.
- Internal links.
- Sitemaps.
- Structured data.
- Open Graph.
- Hreflang, only where real localized equivalents exist. Don't manufacture hreflang alternatives or structured-data properties.

On recipe pages, `recipeCuisine` holds supported culinary traditions, not inferred birthplace; verify the current vocabulary first. Prevent redirect chains and indexing of drafts or unhelpful filter combinations.

## 10. Contribution and moderation

Contributors can:
- Save drafts without choosing a birthplace.
- Add several associations.
- Explain and source individual claims.
- Record uncertainty.
- Propose competing accounts.
- Classify by dimension.
- Add historical and resemblance connections correctly.
- Propose regional variants.

Plain-language helper text explains the distinctions.

Moderation and integrity:
- Preserve authorship, revision history and existing moderation rules. New registrants never get admin privileges.
- Review at statement level.
- Enforce validation and authorization server-side, including on direct API calls.
- Use existing concurrency protections so no editor's work is silently overwritten.

Language:
- Translate vocabulary labels under ADR-003; prose follows the English-pivot workflow.
- Handle long and missing translations, non-Latin names and bidirectional text.
- Never expose raw vocabulary keys.

## 11. Migration and reconciliation

Legacy fields remain until a separate, verified removal project.

**Before backfilling:**
- Establish what each field meant and where it came from.
- Define a reversible mapping.
- Run it on the existing dry-run copy.
- Produce reconciliation reports.

**Defaults:**
- Wikidata-discovered "country of origin" values (Pool A) stay S6 discovery data unless independently supported.
- Legacy origin → `legacy_unreviewed`, evidence `unevidenced`, original value and provenance preserved.
- Public wording: "Associated with …".
- Upgrade only when a qualifying source already supports that specific historical claim.
- Legacy lineage edges become proposed connections unless existing evidence justifies a more specific predicate.
- Ambiguous mappings go to an editorial queue.

**Backfills** are restartable and safe to rerun, with no duplicates on retry.

**Reconcile:**
- Row counts.
- Distinct entity counts.
- Relationship counts.
- Publication states.
- Unmapped records.
- Orphans.
- Duplicate candidates.
- Unexpected nulls.
- Public result counts.

Every discrepancy needs an explanation. Legitimate changes need expected-count rules defined before execution; "counts changed" is not sufficient.

Update all consumers before retiring legacy behavior.

## 12. Research and acceptance content

Researcher and verifier assess claims independently. A non-Wikipedia source is necessary but not sufficient: check that it actually supports the specific claim. Record citation details, access date where relevant and short support notes. Avoid circular sourcing and excessive quotation.

**Falafel and hummus** are acceptance cases for:
- Multiple culinary traditions.
- Separate historical claims.
- Uncertainty.
- Regional variation.

Don't add unsupported history to make the interface look complete. If evidence is insufficient, the real records stay honestly unevidenced and the model is demonstrated with isolated fixtures.

**The 50-dish stress set:** locate it. If it's absent, assemble a documented selection from existing records covering geographic, linguistic, structural and historical complexity, without inventing relationships. Report model failures separately from missing research.

## 13. Testing and independent verification

Use existing tooling. Cover positive cases and meaningful negative cases; a negative test that can't detect a regression doesn't count.

**Required cases:**
- No settled origin.
- One and many associations.
- Historical and cross-border regions.
- Community associations.
- Competing claims.
- Several classifications.
- Multiple influences.
- Symmetric resemblance without descent.
- Directional connection rendering.
- Variant-cycle rejection.
- Duplicate and self-link rejection.
- Approximate dates.
- Search combinations and deduplication.
- Unique counts.
- Draft privacy.
- Contributor and moderator permissions.
- Translation fallbacks.
- Migration preservation and reruns.
- Old URLs.
- Cache and index invalidation.
- API/schema compatibility.

**CI mock data:** update it to the new schema and add a contract test that fails when mocks and live schema diverge. Astro builds against the mocks, so stale mocks would otherwise pass silently.

**Fixtures** never enter the live database or the production content pipeline.

**Performance:**
- Check query plans for dish, place and search views; add indexes and eliminate N+1 queries.
- Compare against the baseline using project-appropriate budgets defined before acceptance, not arbitrary universal thresholds.

## 14. Visual and editorial polish

**Pages to inspect** at desktop and mobile:
- Home.
- Dish with zero, one and many associations.
- Place.
- Family.
- History & connections.
- Contribution and moderation flows.

**Check:**
- Reading hierarchy.
- Typography and spacing.
- Long names and translated labels.
- Image behavior and attribution.
- Badge density.
- Link clarity.
- Overflow and horizontal scrolling.
- Keyboard focus.
- Contrast.
- Touch usability.
- Reduced motion.
- Map/list consistency.
- Empty and error states.

**Automated checks:** run Lighthouse and axe on representative pages, interpret the results, and record manual checks and justified exceptions. Automated scores alone don't prove accessibility.

**Crawl** both domains for broken links, redirect problems, empty pages and outdated origin wording.

**Final consistency pass** across headings, filters, forms, map legends, APIs and metadata: the same relationship means the same thing everywhere.

Save screenshots and reports in the project's established artifact location.

## 15. Operational gates and deployment

Standing gates apply to every live change.

**Database:** verified Gustale backup → recoverable snapshot → dry-run on the existing copy → assertions defined in advance → apply → independent verification.
- Confirm backup freshness and scope, and that the service reporting success actually covers the Gustale database.
- Zero rows is a failure only where nonzero rows were expected.
- Only the Gustale database on shared-postgres. Don't touch neighboring databases or shared infrastructure.

**Deployment:** use the existing pipeline: CI green → deploy → health and behavior checks on both domains → completion or revert. Don't create new staging environments, servers or databases. Prefer additive schema changes that work across mixed application versions.

**Rollback** is defined before applying migrations. Don't assume a destructive down-migration is safe after new writes. On failure, stop further writes, revert application behavior or follow the documented recovery path, and preserve valid new data. Exercise the recovery path once using the existing dry-run copy mechanism before relying on it.

**After deployment, verify:**
- Both domains serve correctly.
- Representative pages and public APIs work.
- Sign-in and moderation permissions are intact.
- Search and caches reflect publication state.
- No new error pattern appears in logs.
- Counts and migrated records reconcile.
- No fixture or draft content is public.

Use a bounded observation window defined in the deployment plan. No unbounded monitoring processes.

## 16. Escalation conditions

Escalate only when:

- A required action is outside what `.hermes/RULES.md` grants.
- A decision can't be implemented without unrecoverable data loss or broken published routes.
- A migration changes public meaning beyond the approved mappings.
- The same gate fails twice after a substantive fix.
- A tool required for the current phase is still blocked after the documented diagnosis steps.
- Backup or recovery can't be verified.
- Schema or environment identity is still uncertain after the documented diagnosis steps.
- Legacy data or revision history would be overwritten or deleted.
- Credentials, paid commitments, new legal terms or broader permissions are required.

Ask one focused question containing:
- The blocker.
- Your recommended action.
- The reason.
- One viable alternative.

Continue all independent cards while waiting. Don't retry an unsafe or rejected action.

## 17. Completion standard

Complete only when:

- Toolchain capabilities used are verified, or their limits are explicit.
- Kanban reflects actual work and evidence.
- The distinctions work across storage, API, editor, search, maps and both domains.
- Legacy information is preserved and reconciled.
- Claim uncertainty and publication state stay distinct.
- Public wording is accurate.
- Important URLs work.
- The interface is responsive, accessible, coherent and polished.
- Relevant checks pass and independent verification is complete.
- Deployment and post-deployment checks succeed, or a specific blocker is reported.
- Documentation and handoff match the delivered state.

Don't report "done" when only the code is written.

## 18. Final delivery report

1. **Delivered result:** what now works.
2. **Changes by phase:** commit and PR links.
3. **Toolchain readiness:** Kanban, plus Claude Code CLI and Codex CLI if used, with evidence.
4. **Verification:** tests, screenshots, accessibility findings, performance vs. baseline, recovery exercise.
5. **Migration reconciliation:** expected vs. actual, with explanations.
6. **Content research:** implemented capability separated from unresolved historical claims.
7. **Editorial review queue:** counts by category, plus the query/export location.
8. **Stress-set results:** model limitations vs. missing evidence.
9. **Deployment status:** versions, environment, checks, remaining steps.
10. **Open work:** limitations and actionable Kanban cards.

Keep it concise and link to detailed artifacts. Never claim a check, migration, review or deployment happened without evidence.
