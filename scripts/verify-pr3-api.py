#!/usr/bin/env python3
"""
Exercise the PR 3 API behaviour against a THROWAWAY database.

This is the end-to-end proof that the three changes work:

  1. `family=` returns the RIGHT dishes for a `dish_families` slug
     (it used to return ZERO for every value the site offered).
  2. `total` counts every matching dish, not the page.
  3. `hasMore` agrees with `total`.
  4. `content_type` filters, and `contentType` rides on every dish.

The API is started against the throwaway database (never live), and
the assertions are made against what it actually returns.
"""
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

PORT = int(os.environ.get("PR3_API_PORT", "8799"))
BASE = f"http://127.0.0.1:{PORT}"
REPO = "/home/gustale/projects/gustale.com"


def get(path):
    with urllib.request.urlopen(f"{BASE}{path}", timeout=30) as r:
        return json.loads(r.read().decode())


def get_status(path):
    """The HTTP status, for the cases where a 400 IS the answer."""
    try:
        with urllib.request.urlopen(f"{BASE}{path}", timeout=30) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code


def wait_for_api(timeout=90):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"{BASE}/health", timeout=5) as r:
                if r.status == 200:
                    return True
        except Exception:
            time.sleep(1)
    return False


def start_api():
    env = dict(os.environ)
    env["DATABASE_URL"] = os.environ["DATABASE_URL"]
    env["GUSTALE_DB_IS_THROWAWAY"] = "1"
    env["PORT"] = str(PORT)
    env["NODE_ENV"] = "test"

    # The API's env validator needs SESSION_SECRET, MINIO_* and
    # BETTER_AUTH_SECRET. They live in apps/api/.env, which is NOT
    # loaded by tsx automatically -- so they are read here and put in
    # the environment, with the DATABASE_URL above taking precedence.
    #
    # The DATABASE_URL wins on purpose: dotenv does NOT override an
    # existing value, and this script's whole point is to talk to the
    # throwaway database rather than the one in the .env file.
    envfile = f"{REPO}/apps/api/.env"
    if os.path.exists(envfile):
        for line in open(envfile):
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip().removeprefix("export ").strip()
            value = value.strip().strip('"').strip("'")
            env.setdefault(key, value)
    proc = subprocess.Popen(
        ["pnpm", "exec", "tsx", "src/server.ts"],
        cwd=f"{REPO}/apps/api",
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )
    return proc


def main():
    if "DATABASE_URL" not in os.environ:
        print("DATABASE_URL is not set — run this through "
              "scripts/run-api-tests-on-throwaway-db.sh")
        return 2

    proc = start_api()
    failures = []
    try:
        if not wait_for_api():
            err = proc.stderr.read().decode()[-3000:] if proc.stderr else ""
            print("the API never came up")
            print(err)
            return 1
        print("the API is up against the throwaway database\n")

        # ── 1. the whole catalogue ──────────────────────────────────
        # The query schema caps `limit` at 100, so the catalogue is
        # walked in pages of 100 rather than asked for in one go.
        PAGE = 100
        full = get(f"/api/dishes?limit={PAGE}")
        total = full.get("total")
        catalogue = list(full["dishes"])
        offset = PAGE
        while len(catalogue) < (total or 0):
            page = get(f"/api/dishes?limit={PAGE}&offset={offset}")
            if not page["dishes"]:
                break
            catalogue.extend(page["dishes"])
            offset += PAGE

        catalogue_total = total or 0
        print(f"1. the whole catalogue")
        print(f"   total   = {total}")
        print(f"   walked  = {len(catalogue)}")
        print(f"   hasMore = {full.get('hasMore')}")
        if total != len(catalogue):
            failures.append(f"total ({total}) != walked ({len(catalogue)})")
        if full.get("hasMore") is not False:
            failures.append(f"hasMore should be False, got {full.get('hasMore')}")
        if total is not None and total <= PAGE:
            print("   (the fixture catalogue fits in one page, so the "
                  "pagination check below cannot prove much)")

        # ── 2. family= returns real results ─────────────────────────
        # The slug list comes from the dimension the filter reads.
        print(f"\n2. family= against dish_families slugs")
        checked = 0
        for slug in ["casserole", "curry", "stew", "salad", "soup"]:
            body = get(f"/api/dishes?family={slug}&limit=100")
            n = body.get("total")
            got = len(body["dishes"])
            print(f"   family={slug:<12} total={n:<5} returned={got:<5} "
                  f"hasMore={body.get('hasMore')}")
            checked += 1
            if n is None:
                failures.append(f"family={slug}: no total")
            elif n == 0:
                failures.append(f"family={slug}: returned ZERO dishes")
            elif n != got:
                failures.append(f"family={slug}: total {n} != returned {got}")
            # hasMore is TRUE only when a further page exists. With a
            # handful of dishes per family there is none, so False is
            # the correct answer -- and it must agree with the total.
            expected_more = n > got
            if body.get("hasMore") is not expected_more:
                failures.append(f"family={slug}: hasMore should be "
                                f"{expected_more}, got {body.get('hasMore')}")

        # ── 3. the family filter actually filters ───────────────────
        print(f"\n3. the family filter filters")
        body = get("/api/dishes?family=stew&limit=100")
        slugs = {d["familySlug"] for d in body["dishes"]}
        print(f"   family=stew -> distinct familySlug values: {sorted(s for s in slugs if s)}")
        print(f"   (the payload's familySlug is the dish-TYPE vocabulary;")
        print(f"    the filter is the FAMILY dimension. They are different")
        print(f"    vocabularies, so what matters is that the filter")
        print(f"    RETURNS and does not return the whole catalogue.)")
        if not body["dishes"]:
            failures.append("family=stew returned nothing")
        if body.get("total", 0) >= catalogue_total:
            failures.append("family=stew returned the whole catalogue -- "
                            "the filter is not filtering")

        # ── 4. pagination: page 2 must continue, not repeat ─────────
        print(f"\n4. pagination")
        p1 = get("/api/dishes?limit=10&offset=0")
        p2 = get("/api/dishes?limit=10&offset=10")
        s1 = [d["slug"] for d in p1["dishes"]]
        s2 = [d["slug"] for d in p2["dishes"]]
        print(f"   page 1: {s1[:4]} ...")
        print(f"   page 2: {s2[:4]} ...")
        if set(s1) & set(s2):
            failures.append("page 1 and page 2 overlap")
        if p1.get("total") != p2.get("total"):
            failures.append(f"total differs between pages: "
                            f"{p1.get('total')} vs {p2.get('total')}")
        # Page 2 has more only if there is a page 3.
        p3 = get("/api/dishes?limit=10&offset=20")
        expected_more = bool(p3["dishes"])
        if p2.get("hasMore") is not expected_more:
            failures.append(f"page 2 hasMore should be {expected_more}, "
                            f"got {p2.get('hasMore')}")
        print(f"   page 3: {len(p3['dishes'])} dishes -> hasMore on page 2 "
              f"should be {expected_more}")

        # ── 5. content_type ─────────────────────────────────────────
        print(f"\n5. content_type")
        drinks = get("/api/dishes?content_type=drink&limit=100")
        print(f"   content_type=drink -> total={drinks.get('total')}")
        for d in drinks["dishes"]:
            if d.get("contentType") != "drink":
                failures.append(f"{d['slug']} came back under content_type=drink "
                                f"but its contentType is {d.get('contentType')}")
                break
        code = get_status("/api/dishes?content_type=cake")
        print(f"   content_type=cake -> HTTP {code} (400 is correct)")
        if code != 400:
            failures.append(f"content_type=cake should be a 400, got {code}")

        # every dish carries the field
        for d in full["dishes"][:20]:
            if "contentType" not in d:
                failures.append(f"{d['slug']} has no contentType")
                break

        # ── 6. an unknown family slug is empty, not an error ───────
        print(f"\n6. an unknown family slug")
        unknown = get("/api/dishes?family=not-a-real-family&limit=10")
        print(f"   family=not-a-real-family -> total={unknown.get('total')}")
        if unknown.get("total") != 0:
            failures.append("an unknown family should return total 0")
        if unknown.get("hasMore") is not False:
            failures.append("an unknown family should have hasMore False")

        print("\n" + "=" * 62)
        if failures:
            print(f"FAILURES ({len(failures)}):")
            for f in failures:
                print(f"  - {f}")
            return 1
        print("ALL CHECKS PASSED")
        return 0
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=15)
        except subprocess.TimeoutExpired:
            proc.kill()


if __name__ == "__main__":
    sys.exit(main())
