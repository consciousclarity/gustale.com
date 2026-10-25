# GUS-012 — Backup & disaster recovery verification (MinIO object storage)

**Date:** 2026-10-25 · **Scope:** object-storage (MinIO) half of the offsite backup. The Postgres half was proven on 2026-10-16.
**Result:** ✅ **PASS — the MinIO object backup is proven restorable.**

---

## 1. What was already known

- **Postgres:** proven restorable on 2026-10-16 — pulled `gustale_backup_20261016T010943Z.dump.gpg` offsite, decrypted with `.backup-key`, sha256-verified against the remote claim, restored into a throwaway `postgis/postgis:16-3.4` container. 45 tables (incl. PostGIS), 121 published dishes, exact match with the live API.
- **MinIO:** *not* tested. GUS-011/GUS-012 both flagged it as the open half.

## 2. The finding

The backup was never missing — the **proof** was.

`/home/deploy/gustale.com/backups/backup.py` → `backup_media()`:

```python
for bucket in ("gustale-public", "gustale-media"):
    rclone sync minio:<bucket> gdrive-crypt:media/<bucket> \
      --backup-dir gdrive-crypt:media/deleted/<day>/<bucket> \
      --create-empty-src-dirs --check-first
```

Both buckets are synced daily to the encrypted rclone remote, one file per object. `backup.log` confirms a clean run at **2026-10-25T12:53:53Z**:

```
MinIO bucket synced through encrypted rclone remote: gustale-public
MinIO bucket synced through encrypted rclone remote: gustale-media
SUCCESS: encrypted offsite backup complete: gustale_backup_20261025T045006Z.dump.gpg
```

Two properties worth noting:
- `rclone sync` + `--backup-dir` means **deleted or replaced objects are retained for 90 days** under `gdrive-crypt:media/deleted/<day>/<bucket>` — the archive survives a bad delete, not just a lost bucket.
- The media remote is `gdrive-crypt:` — encrypted at rest with the rclone crypt layer, so the offsite copy is not readable without the key.

## 3. The verification

New script: `scripts/hermes/verify-minio-restore.sh`. Read-only with respect to live data — it reads live, writes to a temp dir, and uses a throwaway MinIO container that is torn down on exit.

1. Inventory the live buckets (what must survive a restore).
2. Pull the encrypted offsite copies down via rclone.
3. Compare **every** object: key present, byte size identical, **sha256 identical** (all 33, not a sample).
4. Load the offsite-only copies into a throwaway MinIO and read them back, proving the restored bucket actually *serves* — not just that the files copied.
5. Tear down.

### Result

```
=== 1. inventorying live buckets at http://127.0.0.1:9000 ===
  gustale-public: 22 objects
  gustale-media: 11 objects
=== 2. pulling the offsite (encrypted) object copies ===
  gdrive-crypt:media/gustale-public: 22 objects
  gdrive-crypt:media/gustale-media: 11 objects
=== 3. comparing live vs offsite (keys, sizes, sha256) ===
  compared 33 objects
  missing offsite  : 0
  size mismatches : 0
  hash mismatches : 0
=== 4. loading the restored objects into a throwaway MinIO ===
  loaded gustale-public into the throwaway instance
  served gustale-public/dishes/babi-guling/cover-1536w.webp (116214 bytes, sha256 matches the offsite copy)
  loaded gustale-media into the throwaway instance
  served gustale-media/unattached/3171e3866b3c49d2.webp (116506 bytes, sha256 matches the offsite copy)

=== RESULT ===
PASS — the MinIO object backup is proven restorable.
  33 objects compared: 0 missing, 0 size mismatches, 0 hash mismatches.
  2 object(s) served from a throwaway instance built only from the offsite copy.
```

Exit code **0**.

## 4. Independent cross-check (from outside the VPS)

Before the script existed, the live object surface was swept through the public API and the public `/media/*` route: **33 media objects referenced across 121 dishes, 33 serving HTTP 200, 0 failures.**

Breakdown of the 11 media rows the API reports:

| Bucket | Objects | Shape |
|---|---|---|
| `gustale-public` | 22 | `dishes/<slug>/cover-{800,1536}w.webp` for 11 dishes |
| `gustale-media` (private) | 11 | `unattached/<hash>.<ext>` master files |

Total ~1.5 MB. The private bucket holds the master uploads; the public bucket holds the WebP variants the site actually serves. Both are covered by the backup.

## 5. Things learned while building this (worth keeping)

- **MinIO requires AWS4-HMAC-SHA256**, not HTTP Basic auth. A `curl -u` probe returns `InvalidRequest ... please use AWS4-HMAC-SHA256` — which looks like a broken restore but is just the wrong auth mechanism. rclone already speaks the right protocol, so the serve check goes through rclone.
- **rclone's per-object round trips are brutal over an encrypted remote.** The first version did two `rclone lsjson` + one `rclone cat` per object; it ran for 10+ minutes without finishing. Batching to one `lsjson -R` per bucket for the size table, and downloading live objects once so the hash comparison is disk-to-disk, brought it to ~2 minutes.
- `rclone lsjson` emits `"Size"` (capital S) and `"Path"` — the sed extractors in the script match those exactly.

## 6. Residual risk / not covered

- **Application redeployment** was already proven operationally by GUS-008 (the deploy verification report, 2026-10-24) — every merge-to-main runs a real deploy and verifies container images + live endpoints.
- The offsite copy is only as fresh as the last backup run. The timer runs daily; the last success was 2026-10-25T12:53:53Z. **Worst-case data loss window = the time since the last successful run.**
- The script needs `rclone` configured with the `gdrive-crypt:` remote and `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` available (it reads `/home/deploy/gustale.com/.env`). It never prints secret values.

## 7. How to re-run

On the VPS, as the deploy user:

```bash
bash /home/gustale/projects/gustale.com/scripts/hermes/verify-minio-restore.sh
```

Exit 0 = proven restorable. Exit 1 = not proven; the log names the mismatching objects.

Recommended cadence: once a month, and after any change to `backup.py` or to the MinIO bucket layout.
