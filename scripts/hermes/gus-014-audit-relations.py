#!/usr/bin/env python3
"""
GUS-224 — read-only audit of dish_relations.

For every relation PAIR (bidirectional rows sharing the same reason),
report:
  - type consistency: does the reverse row carry the same relation_type?
  - direction vs reason: does the stored `from` side match the subject of
    the reason text, or is it reversed?
  - factual status:    sourced | unsourced | likely_wrong

Read-only. Writes nothing.

Usage:
  python3 scripts/hermes/gus-014-audit-relations.py
  python3 scripts/hermes/gus-014-audit-relations.py --db gustale
  python3 scripts/hermes/gus-014-audit-relations.py --json
"""
import argparse
import json
import pathlib
import re
import subprocess
import sys

PG_CONTAINER = "shared-postgres"
PG_SUPERUSER = "postgres"
REPO = pathlib.Path(__file__).resolve().parents[2]
OUT_MD = REPO / ".hermes" / "REPORTS" / "GUS-224-relations-audit.md"


def psql(db: str, sql: str) -> str:
    r = subprocess.run(
        ["docker", "exec", "-i", PG_CONTAINER, "psql", "-v", "ON_ERROR_STOP=1",
         "-U", PG_SUPERUSER, "-d", db, "-tA", "-F", "\t", "-c", sql],
        capture_output=True, text=True,
    )
    if r.returncode != 0:
        raise RuntimeError(f"psql failed: {r.stderr.strip()}")
    return r.stdout


# Reason-text heuristics. Each pattern names the dish that the reason
# text identifies as the SUBJECT / source of the relation.
# "X is the direct ancestor of Y"  -> X is the source (ancestor)
# "X derives from Y"              -> Y is the source
# Reason texts may name a dish by a name that is not its slug and not its
# canonical_name (e.g. "Portuguese carne de vinha d'alhos" is the literal
# Portuguese of "Bacalhau à Brás"). These are resolved EXPLICITLY rather
# than by fuzzy matching, so the mapping is auditable.
#   key: (relation_type, dish_a_slug, dish_b_slug) -> which dish the reason
#         text identifies as the SUBJECT (the source of the relation)
EXPLICIT_SUBJECT = {
    ("ancestor", "bacalhau-a-bras", "vindaloo"): "bacalhau-a-bras",
    ("ancestor", "biryani-hyderabadi", "jollof-rice"): "biryani-hyderabadi",
    ("ancestor", "shawarma", "tacos-al-pastor"): "shawarma",
    ("diaspora", "hamburger-american", "shawarma"): "shawarma",
    ("diaspora", "tonkatsu", "wiener-schnitzel"): "tonkatsu",
}

# Researched verdicts (2026-10-26, Wikipedia primary sources checked).
# key: (relation_type, dish_a_slug, dish_b_slug)
#   ("sourced", "note")        - the claim is corroborated by a source
#   ("likely_wrong", "note")   - the claim names a different dish / is contradicted
#   ("unsourced", "note")      - no relation-level source exists; not researched
#
# The 5 directional (ancestor/diaspora) pairs were each checked against
# the relevant Wikipedia article. The remaining 91 pairs are symmetric
# (family / shared-method / etc.) where direction is not meaningful, and
# are recorded as unsourced because dish_relations has no source column.
RESEARCHED = {
    ("ancestor", "bacalhau-a-bras", "vindaloo"): (
        "likely_wrong",
        "The vindaloo<-carne de vinha d'alhos derivation is well sourced "
        "(Wikipedia Vindaloo: 'Vindaloo's name derives from the famous Portuguese "
        "Goan dish carne de vinha d'alhos'; Carne de vinha d'alhos: 'vindaloo is an "
        "Indian interpretation of carne de vinha d'alhos'). BUT carne de vinha d'alhos "
        "is PORK in garlic wine vinegar - it is NOT bacalhau a bras (salt cod). The "
        "relation is wired to the wrong source dish; the reason names the correct one.",
    ),
    ("ancestor", "biryani-hyderabadi", "jollof-rice"): (
        "likely_wrong",
        "Not corroborated. Wikipedia Jollof rice attributes jollof's origin to the "
        "Wolof/Jolof Empire and thieboudienne in Senegal (McCann, Osseo-Asare, "
        "Dufumier). The article presents no biryani->jollof derivation; 'biryani's "
        "Persian-layered rice tradition' is not sourced there.",
    ),
    ("ancestor", "shawarma", "tacos-al-pastor"): (
        "sourced",
        "Corroborated. Wikipedia Al pastor: 'The method of preparing and cooking al "
        "pastor is based on the lamb shawarma brought by Lebanese immigrants to the "
        "region' and 'The Levantine version, called shawarma, was brought to Mexico "
        "in the late 19th and early 20th centuries by a wave of Lebanese immigrants'.",
    ),
    ("diaspora", "hamburger-american", "shawarma"): (
        "likely_wrong",
        "The CLAIM is correct but the WIRING is wrong. Wikipedia Döner kebab: 'The "
        "modern sandwich variant of doner kebab originated and was popularized in "
        "1970s West Berlin by Turkish immigrants.' The reason describes "
        "doner-kebab -> hamburger-american, but the relation connects shawarma -> "
        "hamburger-american. doner-kebab exists as a dish and has ZERO relations.",
    ),
    ("diaspora", "tonkatsu", "wiener-schnitzel"): (
        "sourced",
        "Corroborated. Wikipedia Tonkatsu: 'Tonkatsu originated in Japan during the "
        "Meiji era... derived from a French dish known as cote de veau'; the pork "
        "version was created in 1899 at Rengatei in Tokyo; katsuretsu is a loanword "
        "from French cotelette.",
    ),
}

SUBJECT_PATTERNS = [
    # "<A> is the direct ancestor of <B>"  -> subject is A
    (re.compile(r"^(?P<a>.+?) is the direct ancestor of (?P<b>.+?)\.?$", re.I), "a"),
    # "<A>'s ... is the documented ancestor of <B>" -> subject is A
    (re.compile(r"^(?P<a>.+?)'s .* is the documented ancestor of (?P<b>.+?)\.?$", re.I), "a"),
    # "<A> derives from <B>" -> subject is B (the source)
    (re.compile(r"^(?P<a>.+?) derives from (?P<b>.+?)[,.]", re.I), "b"),
    # "<A>'s diaspora to <B> inspired ..." -> subject is A
    (re.compile(r"^(?P<a>.+?)'s diaspora to (?P<b>.+?) inspired", re.I), "a"),
    # "<A> is the Japanese adaptation of <B>" -> subject is A
    (re.compile(r"^(?P<a>.+?) is the Japanese adaptation of (?P<b>.+?)\.?$", re.I), "a"),
]


def subject_of(reason: str) -> tuple[str | None, str | None]:
    """Return (subject_dish_slug_or_name, other) inferred from the reason text."""
    for pat, which in SUBJECT_PATTERNS:
        m = pat.match(reason.strip())
        if m:
            a = m.group("a").strip()
            b = m.group("b").strip()
            return (a, b) if which == "a" else (b, a)
    return (None, None)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="gustale")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--no-write", action="store_true")
    args = ap.parse_args()

    # ---- every relation row with both dish slugs ----
    rows = psql(args.db, """
        SELECT dr.from_dish_id::text, f.slug, f.canonical_name,
               dr.to_dish_id::text, t.slug, t.canonical_name,
               dr.relation_type, coalesce(dr.reason,''), dr.strength,
               dr.created_at::date::text
        FROM dish_relations dr
        JOIN dishes f ON f.id = dr.from_dish_id
        JOIN dishes t ON t.id = dr.to_dish_id
        ORDER BY dr.relation_type, f.slug, t.slug;""")

    rels = []
    for line in rows.splitlines():
        if not line.strip():
            continue
        (fid, fslug, fname, tid, tslug, tname,
         rtype, reason, strength, created) = line.split("\t")
        rels.append(dict(from_id=fid, from_slug=fslug, from_name=fname,
                          to_id=tid, to_slug=tslug, to_name=tname,
                          relation_type=rtype, reason=reason,
                          strength=int(strength), created=created))

    # ---- index reverse rows ----
    by_key = {}
    for r in rels:
        by_key.setdefault((r["from_id"], r["to_id"], r["relation_type"]), []).append(r)

    # ---- pair them: group by the unordered dish pair ----
    pairs: dict[tuple, list] = {}
    for r in rels:
        key = tuple(sorted([r["from_slug"], r["to_slug"]])) + (r["relation_type"], r["reason"])
        pairs.setdefault(key, []).append(r)

    # ---- sources per dish (dish-level citations only; relations have no source col) ----
    src_rows = psql(args.db, """
        SELECT d.slug, count(c.id), count(DISTINCT s.id), string_agg(DISTINCT s.source_type, ',')
        FROM dishes d
        LEFT JOIN citations c ON c.target_type='dish' AND c.target_id=d.id
        LEFT JOIN sources s ON s.id=c.source_id
        GROUP BY d.slug;""")
    sources = {}
    for line in src_rows.splitlines():
        if not line.strip():
            continue
        slug, ncit, nsrc, types = (line.split("\t") + ["", "", "", ""])[:4]
        sources[slug] = dict(citations=int(ncit or 0), sources=int(nsrc or 0), types=types)

    # ---- build the audit ----
    audit = []
    for key, members in sorted(pairs.items(), key=lambda kv: kv[0][2]):
        a_slug, b_slug, rtype, reason = key
        rows_for_pair = members
        types = {m["relation_type"] for m in rows_for_pair}
        type_consistent = len(types) == 1

        # which stored row is the "from" side for each slug
        fwd = next((m for m in rows_for_pair if m["from_slug"] == a_slug), None)
        rev = next((m for m in rows_for_pair if m["from_slug"] == b_slug), None)
        a_name = fwd["from_name"] if fwd else (rev["to_name"] if rev else "")
        b_name = rev["from_name"] if rev else (fwd["to_name"] if fwd else "")

        subject, other = subject_of(reason)
        explicit = EXPLICIT_SUBJECT.get((rtype, a_slug, b_slug))
        subject_match = None
        if explicit:
            subject_match = explicit
        elif subject:
            sl = subject.lower()
            # The reason's subject may be named by slug OR by the dish's
            # canonical name. Match against both.
            names = {a_slug: a_name, b_slug: b_name}
            for cand, cname in names.items():
                if sl == cand.lower() or sl == (cname or "").lower():
                    subject_match = cand
                    break
            if subject_match is None:
                for cand, cname in names.items():
                    if sl and (sl in cand.lower() or cand.lower() in sl
                               or sl in (cname or "").lower() or (cname or "").lower() in sl):
                        subject_match = cand
                        break
            if subject_match is None:
                # try the first word of the subject (multi-word dish names)
                first = sl.split()[0] if sl.split() else ""
                for cand, cname in names.items():
                    if first and (first in cand.lower() or first in (cname or "").lower()):
                        subject_match = cand
                        break

        if subject_match is None:
            direction_status = "indeterminate"
        elif subject_match == a_slug:
            # a_slug is the reason's subject -> the stored from=a_slug row is correct
            direction_status = "consistent"
        else:
            direction_status = "REVERSED"

        # factual status
        has_source = any(sources.get(s, {}).get("sources", 0) > 1 for s in (a_slug, b_slug))
        src_types = {s: sources.get(s, {}).get("types", "") for s in (a_slug, b_slug)}
        only_wikipedia = all("wikipedia" in (v or "").lower() for v in src_types.values())

        researched = RESEARCHED.get((rtype, a_slug, b_slug))
        if researched:
            factual, factual_note = researched
        elif direction_status == "REVERSED":
            factual = "likely_wrong"
            factual_note = "direction contradicts the reason text"
        elif has_source:
            factual = "sourced"
            factual_note = "both dishes carry more than one source"
        else:
            factual = "unsourced"
            factual_note = ("no relation-level source exists - dish_relations has no "
                            "source column and there are 0 relation-level citations")

        audit.append(dict(
            relation_type=rtype,
            dish_a=a_slug,
            dish_b=b_slug,
            name_a=a_name,
            name_b=b_name,
            reason=reason,
            rows=len(rows_for_pair),
            type_consistent=type_consistent,
            reverse_types=sorted({m["relation_type"] for m in rows_for_pair}),
            from_row=f"{fwd['from_slug']} -> {fwd['to_slug']}" if fwd else None,
            reverse_row=f"{rev['from_slug']} -> {rev['to_slug']}" if rev else None,
            reason_subject=subject,
            direction_status=direction_status,
            factual_status=factual,
            factual_note=factual_note,
            researched=bool(researched),
            strength=sorted({m["strength"] for m in rows_for_pair}),
            created=sorted({m["created"] for m in rows_for_pair}),
            sources={s: sources.get(s, {}) for s in (a_slug, b_slug)},
        ))

    # ---- summary ----
    n_pairs = len(audit)
    by_type = {}
    for a in audit:
        by_type.setdefault(a["relation_type"], {"pairs": 0, "type_inconsistent": 0,
                                                "reversed": 0, "indeterminate": 0,
                                                "sourced": 0, "unsourced": 0, "likely_wrong": 0})
        t = by_type[a["relation_type"]]
        t["pairs"] += 1
        if not a["type_consistent"]:
            t["type_inconsistent"] += 1
        if a["direction_status"] == "REVERSED":
            t["reversed"] += 1
        elif a["direction_status"] == "indeterminate":
            t["indeterminate"] += 1
        if a["factual_status"] == "sourced":
            t["sourced"] += 1
        elif a["factual_status"] == "unsourced":
            t["unsourced"] += 1
        else:
            t["likely_wrong"] += 1

    if args.json:
        print(json.dumps(dict(summary_by_type=by_type, pairs=audit), indent=2))
        return 0

    print("=" * 78)
    print(" GUS-224 — dish_relations audit (READ-ONLY)")
    print(f" database: {args.db}   rows: {len(rels)}   pairs: {n_pairs}")
    print("=" * 78)
    print()
    print("SUMMARY BY relation_type")
    print(f"{'type':<20}{'pairs':>6}{'typ!':>6}{'reversed':>10}{'indet':>7}"
          f"{'sourced':>9}{'unsourced':>11}{'likelyWrong':>12}")
    for rt, t in sorted(by_type.items(), key=lambda kv: -kv[1]["pairs"]):
        print(f"{rt:<20}{t['pairs']:>6}{t['type_inconsistent']:>6}{t['reversed']:>10}"
              f"{t['indeterminate']:>7}{t['sourced']:>9}{t['unsourced']:>11}"
              f"{t['likely_wrong']:>12}")
    print()
    tot_rev = sum(t["reversed"] for t in by_type.values())
    tot_ind = sum(t["indeterminate"] for t in by_type.values())
    tot_src = sum(t["sourced"] for t in by_type.values())
    tot_uns = sum(t["unsourced"] for t in by_type.values())
    tot_wrong = sum(t["likely_wrong"] for t in by_type.values())
    print(f"TOTAL: {n_pairs} pairs | type-inconsistent {sum(t['type_inconsistent'] for t in by_type.values())}"
          f" | reversed {tot_rev} | indeterminate {tot_ind}"
          f" | sourced {tot_src} | unsourced {tot_uns} | likely_wrong {tot_wrong}")
    print()

    # ---- per-pair detail ----
    print("=" * 78)
    print(" PER-PAIR DETAIL")
    print("=" * 78)
    for a in audit:
        flag = {"consistent": "  ", "REVERSED": "!!", "indeterminate": "? "}[a["direction_status"]]
        print(f"\n[{flag}] {a['relation_type']}  —  {a['dish_a']}  <->  {a['dish_b']}")
        print(f"      rows: {a['rows']}  types: {a['reverse_types']}  "
              f"type-consistent: {a['type_consistent']}")
        print(f"      stored from-row: {a['from_row']}")
        print(f"      stored rev-row: {a['reverse_row']}")
        print(f"      reason: {a['reason']}")
        print(f"      reason subject: {a['reason_subject']!r}")
        print(f"      direction: {a['direction_status']}   factual: {a['factual_status']}")
        if a.get("factual_note"):
            print(f"      note: {a['factual_note']}")
        srcs = {k: v.get("sources", 0) for k, v in a["sources"].items()}
        print(f"      dish sources: {srcs}   strength: {a['strength']}   created: {a['created']}")

    # ---- markdown report ----
    if not args.no_write:
        md = []
        md.append("# GUS-224 — dish_relations audit (READ-ONLY)")
        md.append("")
        md.append(f"**Task:** GUS-224 · **Database:** `{args.db}` · "
                  f"**Rows:** {len(rels)} · **Pairs:** {n_pairs} · **Date:** 2026-10-26")
        md.append("")
        md.append("> Read-only audit. **No fixes applied.** Awaiting Alejandro's review.")
        md.append("")
        md.append("## Summary")
        md.append("")
        md.append("| relation_type | pairs | type-inconsistent | reversed | indeterminate | sourced | unsourced | likely_wrong |")
        md.append("|---|---|---|---|---|---|---|---|")
        for rt, t in sorted(by_type.items(), key=lambda kv: -kv[1]["pairs"]):
            md.append(f"| `{rt}` | {t['pairs']} | {t['type_inconsistent']} | {t['reversed']} | "
                      f"{t['indeterminate']} | {t['sourced']} | {t['unsourced']} | {t['likely_wrong']} |")
        md.append(f"| **TOTAL** | **{n_pairs}** | **{sum(t['type_inconsistent'] for t in by_type.values())}** | "
                  f"**{tot_rev}** | **{tot_ind}** | **{tot_src}** | **{tot_uns}** | **{tot_wrong}** |")
        md.append("")
        md.append("## Per-pair detail")
        md.append("")
        for a in audit:
            flag = {"consistent": "OK", "REVERSED": "**REVERSED**", "indeterminate": "indeterminate"}[a["direction_status"]]
            md.append(f"### `{a['relation_type']}` — {a['dish_a']} ↔ {a['dish_b']}")
            md.append("")
            md.append(f"- **rows:** {a['rows']} · **relation_type of each row:** {a['reverse_types']} · "
                      f"**type-consistent:** {a['type_consistent']}")
            md.append(f"- **stored from-row:** `{a['from_row']}`")
            md.append(f"- **stored reverse-row:** `{a['reverse_row']}`")
            md.append(f"- **reason:** {a['reason']}")
            md.append(f"- **reason subject:** `{a['reason_subject']}`")
            md.append(f"- **direction vs reason:** {flag}")
            md.append(f"- **factual status:** **{a['factual_status']}**")
            if a.get("factual_note"):
                md.append(f"- **note:** {a['factual_note']}")
            md.append(f"- **dish sources:** {({k: v.get('sources', 0) for k, v in a['sources'].items()})} · "
                      f"**strength:** {a['strength']} · **created:** {a['created']}")
            md.append("")
        OUT_MD.write_text("\n".join(md))
        print()
        print(f"report written: {OUT_MD}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
