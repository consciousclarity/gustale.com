#!/usr/bin/env python3
"""
GUS-224 — verify the Option B relations migration.

Gates (from Alejandro, 2026-10-26):
  G1  96 rows in dish_relations (active + quarantined)
  G2  0 self-contradicting pairs (directional types with both directions)
  G3  0 symmetric mismatches (a symmetric pair's two rows differing in
      strength or reason)
  G4  4 quarantined pairs, each collapsed to exactly ONE row
  G5  the 5 directional keep-rows are exactly the expected explicit ids
  G6  96 archived inverse rows, original ids preserved
  G7  symmetric rows satisfy from_dish_id < to_dish_id
  G8  the derived view emits the inverse for SYMMETRIC types only
  G9  the public view excludes quarantined rows
  G10 the pilot relation is live (not quarantined)

Read-only. Writes nothing.

Usage:
  python3 scripts/hermes/gus-014-verify-relations-option-b.py --db gustale
  python3 scripts/hermes/gus-014-verify-relations-option-b.py --db gustale --json
"""
import argparse
import json
import subprocess
import sys

PG_CONTAINER = "shared-postgres"
PG_SUPERUSER = "postgres"

# The 5 directional keep-rows, explicit ids (from the 2026-10-26 audit).
# No auto-parsing - these are the rows the migration must retain.
EXPECTED_KEEP = {
    "b7e468e0-16c5-4499-8bd4-ab2ecb95d677": ("shawarma", "tacos-al-pastor", "ancestor", "active"),
    "0afcdf4e-e05f-5315-8b24-67e3b8a15aa0": ("bacalhau-a-bras", "vindaloo", "ancestor", "quarantined"),
    "7109f0e7-9d99-5858-9ee2-78e3a6fe1c90": ("biryani-hyderabadi", "jollof-rice", "ancestor", "quarantined"),
    "27b97221-f85c-532c-9264-7899f34399b7": ("shawarma", "hamburger-american", "diaspora", "quarantined"),
    "c212c598-0297-4597-aefa-6dc4bfc9e3a6": ("tonkatsu", "wiener-schnitzel", "diaspora", "quarantined"),
}
EXPECTED_ARCHIVED_INVERSES = {
    "78dd6076-08ca-4cd5-91a0-6d80f266aa39",
    "55acfe66-13a1-53a2-94f0-fb2f5e3cb8ee",
    "2ded426c-c667-5b40-8e86-da52cb7a51f3",
    "11ff5b8d-eb5c-521f-a10a-d04058d4785f",
    "01ef505e-75cc-433d-a6e4-5a65bfe5a515",
}
PILOT_ROW = "b7e468e0-16c5-4499-8bd4-ab2ecb95d677"


def psql(db: str, sql: str) -> str:
    r = subprocess.run(
        ["docker", "exec", "-i", PG_CONTAINER, "psql", "-v", "ON_ERROR_STOP=1",
         "-U", PG_SUPERUSER, "-d", db, "-tA", "-F", "\t", "-c", sql],
        capture_output=True, text=True,
    )
    if r.returncode != 0:
        raise RuntimeError(f"psql failed: {r.stderr.strip()}")
    return r.stdout


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    results = []

    def gate(name: str, ok: bool, detail: str = "") -> None:
        results.append({"gate": name, "ok": bool(ok), "detail": detail})

    # ---- G1: row count ----
    n_total = psql(args.db, "SELECT count(*) FROM dish_relations;").strip()
    n_active = psql(args.db, "SELECT count(*) FROM dish_relations WHERE status='active';").strip()
    n_quar = psql(args.db, "SELECT count(*) FROM dish_relations WHERE status='quarantined';").strip()
    gate("G1 row count = 96", n_total == "96", f"total={n_total} active={n_active} quarantined={n_quar}")
    gate("G1 active+quarantined = 96", int(n_active) + int(n_quar) == 96,
         f"active={n_active} + quarantined={n_quar} = {int(n_active)+int(n_quar)}")

    # ---- G2: self-contradicting pairs ----
    selfcon = psql(args.db, """
        SELECT count(*) FROM (
          SELECT 1 FROM dish_relations a
          JOIN dish_relations b
            ON b.from_dish_id = a.to_dish_id AND b.to_dish_id = a.from_dish_id
           AND b.relation_type_id = a.relation_type_id
          JOIN relation_types rt ON rt.id = a.relation_type_id
          WHERE rt.is_symmetric = false AND a.id <> b.id
        ) x;""").strip()
    gate("G2 self-contradicting = 0", selfcon == "0", f"count={selfcon}")

    # ---- G3: symmetric mismatches ----
    sym_mismatch = psql(args.db, """
        SELECT count(*) FROM (
          SELECT 1 FROM dish_relations a
          JOIN dish_relations b
            ON b.from_dish_id = a.to_dish_id AND b.to_dish_id = a.from_dish_id
           AND b.relation_type_id = a.relation_type_id
          JOIN relation_types rt ON rt.id = a.relation_type_id
          WHERE rt.is_symmetric = true AND a.id <> b.id
            AND (a.strength <> b.strength OR a.reason <> b.reason)
        ) x;""").strip()
    gate("G3 symmetric mismatches = 0", sym_mismatch == "0", f"count={sym_mismatch}")

    # ---- G4: 4 quarantined, each exactly one row ----
    q = psql(args.db, """
        SELECT r.id::text || ' | ' || f.slug || ' -> ' || t.slug || ' | ' || rt.slug
             || ' | ' || r.status || ' | note=' || coalesce(length(r.quarantine_note)::text,'0')
        FROM dish_relations r
        JOIN relation_types rt ON rt.id = r.relation_type_id
        JOIN dishes f ON f.id = r.from_dish_id
        JOIN dishes t ON t.id = r.to_dish_id
        WHERE r.status='quarantined' ORDER BY rt.slug, f.slug;""")
    q_lines = [l for l in q.splitlines() if l.strip()]
    gate("G4 quarantined = 4", len(q_lines) == 4, f"count={len(q_lines)}")
    for line in q_lines:
        print(f"   quarantined: {line}")

    # each quarantined pair must appear exactly ONCE (collapsed)
    q_pairs = [l.split(" | ")[1] for l in q_lines]
    gate("G4 each quarantined pair collapsed to 1 row",
         len(q_pairs) == len(set(q_pairs)), f"pairs={sorted(q_pairs)}")

    # ---- G5: the 5 directional keep-rows, explicit ids ----
    keep_rows = psql(args.db, """
        SELECT r.id::text || ' | ' || f.slug || ' -> ' || t.slug || ' | ' || rt.slug
             || ' | ' || r.status || ' | ' || r.strength
        FROM dish_relations r
        JOIN relation_types rt ON rt.id = r.relation_type_id
        JOIN dishes f ON f.id = r.from_dish_id
        JOIN dishes t ON t.id = r.to_dish_id
        WHERE rt.is_symmetric = false ORDER BY rt.slug, f.slug;""")
    actual_directional = {}
    for line in keep_rows.splitlines():
        if not line.strip():
            continue
        rid, direction, rtype, status, strength = line.split(" | ")
        actual_directional[rid] = (direction, rtype, status, strength)
        print(f"   directional keep-row: {line}")

    gate("G5 directional keep-row count = 5", len(actual_directional) == 5,
         f"count={len(actual_directional)}")
    missing = set(EXPECTED_KEEP) - set(actual_directional)
    extra = set(actual_directional) - set(EXPECTED_KEEP)
    gate("G5 keep-row ids match the explicit list", not missing and not extra,
         f"missing={sorted(missing)} extra={sorted(extra)}")
    for rid, (fs, ts, rtype, status) in EXPECTED_KEEP.items():
        if rid in actual_directional:
            direction, artype, astatus, astrength = actual_directional[rid]
            want_dir = f"{fs} -> {ts}"
            gate(f"G5 {fs} -> {ts} correct", direction == want_dir and artype == rtype and astatus == status,
                 f"got {direction} | {artype} | {astatus} (want {want_dir} | {rtype} | {status})")

    # ---- G6: archive ----
    n_arch = psql(args.db, "SELECT count(*) FROM dish_relations_archive;").strip()
    gate("G6 archived rows = 96", n_arch == "96", f"count={n_arch}")
    arch_directional = psql(args.db, """
        SELECT count(*) FROM dish_relations_archive
        WHERE id IN ('78dd6076-08ca-4cd5-91a0-6d80f266aa39',
                     '55acfe66-13a1-53a2-94f0-fb2f5e3cb8ee',
                     '2ded426c-c667-5b40-8e86-da52cb7a51f3',
                     '11ff5b8d-eb5c-521f-a10a-d04058d4785f',
                     '01ef505e-75cc-433d-a6e4-5a65bfe5a515');""").strip()
    gate("G6 the 5 directional inverses are archived (original ids)", arch_directional == "5",
         f"count={arch_directional}")
    arch_still_active = psql(args.db, """
        SELECT count(*) FROM dish_relations
        WHERE id IN ('78dd6076-08ca-4cd5-91a0-6d80f266aa39',
                     '55acfe66-13a1-53a2-94f0-fb2f5e3cb8ee',
                     '2ded426c-c667-5b40-8e86-da52cb7a51f3',
                     '11ff5b8d-eb5c-521f-a10a-d04058d4785f',
                     '01ef505e-75cc-433d-a6e4-5a65bfe5a515');""").strip()
    gate("G6 the 5 directional inverses are NOT still in dish_relations",
         arch_still_active == "0", f"still present={arch_still_active}")

    # ---- G7: symmetric canonical direction ----
    bad_dir = psql(args.db, """
        SELECT count(*) FROM dish_relations r
        JOIN relation_types rt ON rt.id = r.relation_type_id
        WHERE rt.is_symmetric = true AND r.from_dish_id >= r.to_dish_id;""").strip()
    gate("G7 symmetric rows have from < to", bad_dir == "0", f"violations={bad_dir}")

    # ---- G8: the view emits the inverse for symmetric types only ----
    view_rows = psql(args.db, """
        SELECT count(*) FROM dish_relations_symmetric;""").strip()
    view_directional_inverses = psql(args.db, """
        SELECT count(*) FROM (
          SELECT 1 FROM dish_relations r
          JOIN relation_types rt ON rt.id = r.relation_type_id
          WHERE rt.is_symmetric = false
            AND EXISTS (SELECT 1 FROM dish_relations_symmetric v
                        WHERE v.source_row_id = r.id
                          AND v.from_dish_id = r.to_dish_id
                          AND v.to_dish_id = r.from_dish_id)
        ) x;""").strip()
    gate("G8 no inverse emitted for directional types", view_directional_inverses == "0",
         f"directional inverses in view={view_directional_inverses}")
    # The symmetric view excludes QUARANTINED rows: 92 active rows emit
    # themselves, and the 91 symmetric active rows also emit their inverse.
    # 92 + 91 = 183. (The 4 quarantined rows emit nothing.)
    gate("G8 view row count = 92 active + 91 symmetric inverses", view_rows == "183",
         f"view rows={view_rows} (expect 92 active + 91 symmetric inverse = 183)")

    # ---- G9: public view excludes quarantined ----
    pub_quar = psql(args.db, """
        SELECT count(*) FROM dish_relations_public v
        JOIN dish_relations r ON r.id = v.source_row_id
        WHERE r.status = 'quarantined';""").strip()
    gate("G9 public view excludes quarantined rows", pub_quar == "0",
         f"quarantined leaking into public view={pub_quar}")
    pub_rows = psql(args.db, "SELECT count(*) FROM dish_relations_public;").strip()
    print(f"   public view rows: {pub_rows} (92 active + 91 symmetric inverse = 183)")

    # ---- G10: the pilot relation is live ----
    pilot = psql(args.db, f"""
        SELECT status FROM dish_relations WHERE id = '{PILOT_ROW}';""").strip()
    gate("G10 pilot relation is active (not quarantined)", pilot == "active",
         f"status={pilot!r}")

    # ---- provenance ----
    eh = psql(args.db, """
        SELECT count(*) FROM edit_history WHERE comment='GUS-224 relations Option B';""").strip()
    gate("edit_history rows logged", int(eh) > 0, f"rows={eh}")

    if args.json:
        print(json.dumps(results, indent=2))
    else:
        print()
        print("=" * 74)
        passed = sum(1 for r in results if r["ok"])
        failed = [r for r in results if not r["ok"]]
        print(f" GATES: {passed} pass / {len(failed)} fail  (of {len(results)})")
        for r in results:
            mark = "PASS" if r["ok"] else "FAIL"
            print(f"   {mark}  {r['gate']}" + (f"  ({r['detail']})" if r["detail"] else ""))
        print("=" * 74)
        if failed:
            print(" VERIFY FAILED")
            return 1
        print(" VERIFY OK")
    return 0 if all(r["ok"] for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())
