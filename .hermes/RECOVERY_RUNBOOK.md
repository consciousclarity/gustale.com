# Gustale — Disaster Recovery Runbook (Post-ADR-002)

This document is the authoritative, step-by-step recovery guide for Gustale. It outlines the exact sequence required to rebuild the entire system, decrypt backups, and restore both database and media assets in the event of a catastrophic VPS or host loss.

---

## 📊 Core Recovery Metrics

| Metric | Target Value | Verification Date | Note |
|---|---|---|---|
| **RPO** (Recovery Point Objective) | **24 hours** | 2026-07-25 | Maximum worst-case data loss window, governed by the daily backup schedule. |
| **RTO** (Recovery Time Objective) — Database Only | **1.415 seconds** | 2026-07-25 | Measured restore time of custom `.dump` schema + data archive into a fresh DB. |
| **RTO** (Recovery Time Objective) — System Rebuild | **~45 minutes** | 2026-07-25 | Projected end-to-end time: VPS provisioning, DNS update, git clone, decryption, S3 sync, and smoke tests. |

---

## ⚠️ What is Unrecoverable?
Any transactional DB writes (user registrations, session cookies, review logs, edit history) or media files uploaded *between* the last daily backup and the point of complete host failure are **permanently lost** (up to a maximum of 24 hours of data, matching our RPO).

---

## 🛠️ Step-by-Step Restoration Procedure

### Phase 1 — Infrastructure & DNS Provisioning
1. **Provision a New VPS:** Spin up a clean Ubuntu 24.04 LTS instance at Hostinger (or alternative provider).
2. **Assign Static IP:** Update your DNS records at your registrar to point `gustale.com`, `gustale.recipes`, and `api.gustale.recipes` to the new VPS static IP address.
3. **Install Host-Level Packages:** Install Docker, Docker Compose, GnuPG, and Rclone:
   ```bash
   sudo apt-get update
   sudo apt-get install -y docker.io docker-compose gnupg rclone
   ```

### Phase 2 — Clone & Configure Environment
1. **Clone the Git Monorepo:** Clone the code to the target directory:
   ```bash
   mkdir -p /home/deploy
   cd /home/deploy
   git clone https://github.com/consciousclarity/gustale.com.git
   chown -R hermes:hermes /home/deploy/gustale.com
   ```
2. **Recreate Secrets (.env & backup-key):**
   * Recreate `/root/.env` and `/home/deploy/gustale.com/.env` containing identical variables (`DATABASE_URL`, better-auth secrets, Resend key, and Cloudflare R2 S3 credentials).
   * **Crucial:** Retrieve the symmetric backup encryption key from your secure offsite credential vault and write it to `/home/deploy/gustale.com/.backup-key` (mode 0600) and `/root/.backup-key` (mode 0600).
   * *A backup you cannot decrypt is not a backup. Never lose the encryption key.*

### Phase 3 — Download & Decrypt Database Backup
1. **Configure Temporary R2 Environment Variables:**
   Configure your active shell session to connect to your Cloudflare R2 bucket:
   ```bash
   export RCLONE_CONFIG_R2_TYPE=s3
   export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
   export RCLONE_CONFIG_R2_ACCESS_KEY_ID=<Your_R2_Access_Key_ID>
   export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY=<Your_R2_Secret_Access_Key>
   export RCLONE_CONFIG_R2_ENDPOINT=<Your_R2_S3_Endpoint_URL>
   export RCLONE_CONFIG_R2_ACL=private
   ```
2. **Download the Latest DB Backup:**
   List and find the latest `.dump.gpg` encrypted archive, then pull it down:
   ```bash
   # List remote backups
   rclone lsf r2:<Your_R2_Bucket_Name>/db/
   
   # Download the latest GPG-encrypted dump
   rclone copyto r2:<Your_R2_Bucket_Name>/db/gustale_backup_<latest_timestamp>.dump.gpg /tmp/latest_backup.dump.gpg
   ```
3. **Decrypt the Backup File:**
   Decrypt the archive using GnuPG with the secure passphrase:
   ```bash
   gpg --decrypt --batch --yes --passphrase-file /home/deploy/gustale.com/.backup-key -o /tmp/latest_backup.dump /tmp/latest_backup.dump.gpg
   ```

### Phase 4 — Launch & Restore Database
1. **Start Database and Storage Containers:**
   Launch the Postgres and MinIO containers in detached mode:
   ```bash
   cd /home/deploy/gustale.com/infra/prod/
   docker compose up -d shared-postgres shared-minio
   ```
2. **Recreate Blank Database:**
   Create the target database `gustale` inside the `shared-postgres` container:
   ```bash
   docker exec -u postgres shared-postgres psql -U postgres -d postgres -c "CREATE DATABASE gustale;"
   ```
3. **Restore Postgres Schema & Data:**
   Pipe the decrypted dump directly into `pg_restore`:
   ```bash
   docker exec -i shared-postgres pg_restore -U postgres -d gustale < /tmp/latest_backup.dump
   ```

### Phase 5 — Restore MinIO Object Storage
1. **Sync Backups back to Local MinIO:**
   Pull all media buckets (`gustale-public` and `gustale-media`) from Cloudflare R2 to your local container volume:
   ```bash
   # Configure local MinIO client env
   export RCLONE_CONFIG_MINIO_TYPE=s3
   export RCLONE_CONFIG_MINIO_PROVIDER=Minio
   export RCLONE_CONFIG_MINIO_ENV_AUTH=false
   export RCLONE_CONFIG_MINIO_ACCESS_KEY_ID=minio_admin
   export RCLONE_CONFIG_MINIO_SECRET_ACCESS_KEY=<MinIO_Root_Password>
   export RCLONE_CONFIG_MINIO_ENDPOINT=http://127.0.0.1:9000
   export RCLONE_CONFIG_MINIO_ACL=private
   
   # Sync offsite mirror back to local container S3 API
   rclone sync r2:<Your_R2_Bucket_Name>/media/ minio: --quiet
   ```

### Phase 6 — Launch Application & Verify
1. **Start Main Application Containers:**
   Launch the Fastify API and Astro/Nginx web containers:
   ```bash
   cd /home/deploy/gustale.com/infra/prod/
   docker compose up -d gustale-api gustale-web-recipes gustale-web-geo
   ```
2. **Perform Smoke Verification Checks:**
   Verify that all public and database-touching routes return healthy HTTP 200 responses:
   ```bash
   # Check API health
   curl -sI https://api.gustale.recipes/health | head -1
   # Check DB data touch
   curl -s https://api.gustale.recipes/api/dishes/vindaloo/journey | jq '.beats | length' # Expect 3
   # Check Web frontend
   curl -sI https://gustale.com/ | head -1
   ```
