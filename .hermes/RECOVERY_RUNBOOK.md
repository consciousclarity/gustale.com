# Gustale — Recovery Runbook

## Targets

- **RPO:** 24 hours 15 minutes. Backup runs daily at `01:00 UTC` with up to 15 minutes jitter.
- **Verified offsite DB restore:** 15.453 seconds on 2026-07-25 for download, decrypt, checksum, restore, and row-count validation.
- **Realistic complete-VPS RTO:** 60–90 minutes, including VPS provisioning, DNS, container pulls, secrets, database restore, media restore, and smoke tests.
- **Unrecoverable:** writes and uploads after the last successful daily backup; external secrets not held in the recovery vault; DNS/registrar access if those credentials are unavailable.

## Required recovery material

1. Obtain GitHub access to `consciousclarity/gustale.com`.
2. Obtain Google Drive account access for the rclone remote.
3. Obtain the backup key from `/home/alex/.local/share/gustale/backup-key` on the Geekom recovery host.
4. Obtain the rclone config from the encrypted credential vault, or re-authorize `gdrive:` and recreate `gdrive-crypt:` with the same backup-key-derived password.
5. Obtain production application secrets for `/root/.env` and `/home/deploy/gustale.com/.env`.

## Complete VPS loss

1. Provision Ubuntu 24.04 and point `gustale.com`, `gustale.recipes`, `api.gustale.com`, and `api.gustale.recipes` to the new IP.

2. Install packages and create the deployment user and deployment directory:

```bash
apt-get update
apt-get install -y docker.io docker-compose-v2 git gnupg rclone jq
useradd -m -s /bin/bash hermes || true
usermod -aG docker hermes
install -d -m 0755 -o hermes -g hermes /home/deploy
```

3. Clone the repository:

```bash
sudo -u hermes git clone https://github.com/consciousclarity/gustale.com.git /home/deploy/gustale.com
cd /home/deploy/gustale.com
git checkout main
git pull --ff-only origin main
```

4. Restore both environment files. Confirm all keys shared by the two files match:

```bash
install -m 0600 -o root -g root /secure/recovery/root.env /root/.env
install -m 0600 -o hermes -g hermes /secure/recovery/deploy.env /home/deploy/gustale.com/.env
python3 - <<'PY'
from pathlib import Path
def read(path):
    out={}
    for raw in Path(path).read_text().splitlines():
        line=raw.strip()
        if line and not line.startswith('#') and '=' in line:
            key,value=line.split('=',1); out[key]=value
    return out
root=read('/root/.env'); deploy=read('/home/deploy/gustale.com/.env')
for key in sorted(root.keys() & deploy.keys()):
    assert root[key] == deploy[key], f'env drift: {key}'
print('shared env keys match')
PY
```

5. Restore the encryption key to both required locations:

```bash
install -m 0600 -o root -g root /secure/recovery/backup-key /root/.backup-key
install -m 0600 -o hermes -g hermes /secure/recovery/backup-key /home/deploy/gustale.com/.backup-key
sha256sum /root/.backup-key /home/deploy/gustale.com/.backup-key
```

6. Re-authorize Google Drive as `hermes` on a browser-capable machine. Restore the encrypted-vault copy of `rclone.conf`, or recreate both remotes with the same key:

```bash
rclone authorize drive
install -d -m 0700 -o hermes -g hermes /home/hermes/.config/rclone
install -m 0600 -o hermes -g hermes /secure/recovery/rclone.conf /home/hermes/.config/rclone/rclone.conf
# If rclone.conf is unavailable, configure gdrive: from the authorization token,
# then recreate gdrive-crypt: using an obscured form of the recovered backup key:
OBSCURED=$(sudo -u hermes rclone obscure "$(cat /home/deploy/gustale.com/.backup-key)")
sudo -u hermes rclone config create gdrive-crypt crypt \
  remote gdrive:gustale_backups/encrypted \
  filename_encryption standard directory_name_encryption true \
  password "$OBSCURED" password2 ""
unset OBSCURED
sudo -u hermes rclone lsd gdrive:
sudo -u hermes rclone lsd gdrive-crypt:
```

7. Start PostgreSQL and MinIO using the production deployment definition:

```bash
cd /home/deploy/gustale.com
# Use the current infra/prod deployment command documented on main.
docker compose -f infra/prod/docker-compose.yml up -d shared-postgres shared-minio
until docker exec shared-postgres pg_isready -U postgres; do sleep 2; done
```

8. Download and decrypt the latest database dump:

```bash
install -d -m 0700 /tmp/gustale-restore
LATEST=$(sudo -u hermes rclone lsf gdrive-crypt:db --files-only \
  | grep -E 'gustale_backup_[0-9]{8}T[0-9]{6}Z\.dump\.gpg$' | sort | tail -1)
sudo -u hermes rclone copyto "gdrive-crypt:db/$LATEST" "/tmp/gustale-restore/$LATEST"
sudo -u hermes rclone copyto \
  "gdrive-crypt:db/${LATEST/.dump.gpg/.dump.sha256}" \
  "/tmp/gustale-restore/${LATEST/.dump.gpg/.dump.sha256}"
gpg --decrypt --batch --yes --passphrase-file /root/.backup-key \
  -o /tmp/gustale-restore/gustale.dump "/tmp/gustale-restore/$LATEST"
EXPECTED=$(awk '{print $1}' "/tmp/gustale-restore/${LATEST/.dump.gpg/.dump.sha256}")
ACTUAL=$(sha256sum /tmp/gustale-restore/gustale.dump | awk '{print $1}')
test "$EXPECTED" = "$ACTUAL"
```

9. Restore the whole database:

```bash
docker exec -u postgres shared-postgres psql -U postgres -d postgres \
  -c 'DROP DATABASE IF EXISTS gustale WITH (FORCE);'
docker exec -u postgres shared-postgres psql -U postgres -d postgres \
  -c 'CREATE DATABASE gustale;'
docker exec -i -u postgres shared-postgres pg_restore -U postgres -d gustale \
  --no-owner --no-privileges < /tmp/gustale-restore/gustale.dump
docker exec -u postgres shared-postgres psql -U postgres -d gustale -At \
  -c "SELECT count(*) FROM pg_tables WHERE schemaname='public';"
```

10. Configure MinIO credentials without printing them and restore both buckets:

```bash
set -a
. /home/deploy/gustale.com/.env
set +a
export RCLONE_CONFIG_MINIO_TYPE=s3
export RCLONE_CONFIG_MINIO_PROVIDER=Minio
export RCLONE_CONFIG_MINIO_ENV_AUTH=false
export RCLONE_CONFIG_MINIO_ACCESS_KEY_ID="$MINIO_ACCESS_KEY"
export RCLONE_CONFIG_MINIO_SECRET_ACCESS_KEY="$MINIO_SECRET_KEY"
export RCLONE_CONFIG_MINIO_ENDPOINT="${MINIO_ENDPOINT:-http://127.0.0.1:9000}"
rclone sync gdrive-crypt:media/gustale-public minio:gustale-public --check-first
rclone sync gdrive-crypt:media/gustale-media minio:gustale-media --check-first
rclone check gdrive-crypt:media/gustale-public minio:gustale-public --one-way
rclone check gdrive-crypt:media/gustale-media minio:gustale-media --one-way
unset MINIO_ACCESS_KEY MINIO_SECRET_KEY
```

11. Start the application with the production deployment method from current `main`:

```bash
cd /home/deploy/gustale.com
# Prefer the current CI/container launch commands; do not invent image tags.
git show origin/main:.github/workflows/ci.yml | less
```

12. Verify production:

```bash
curl -fsS https://api.gustale.recipes/health
curl -fsS 'https://api.gustale.recipes/api/dishes?limit=100' | jq '.dishes | length'
curl -fsS 'https://api.gustale.recipes/api/dishes/map?limit=2000' | jq '.dishes | length, .count'
curl -fsSI https://gustale.com/ | head -1
curl -fsSI https://gustale.recipes/ | head -1
```

13. Reinstall and enable `/home/deploy/gustale.com/backups/backup.py`, `gustale-backup.service`, and `gustale-backup.timer`; trigger one backup and repeat the throwaway restore drill.

14. Remove plaintext restore artifacts:

```bash
rm -rf /tmp/gustale-restore
```
