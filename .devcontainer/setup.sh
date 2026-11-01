#!/bin/bash
# Gustale — Dev container setup script
# Runs automatically after the dev container is created (postCreateCommand)
set -e

echo "=== Gustale dev setup ==="

# 1. Install pnpm if not present
if ! command -v pnpm &>/dev/null; then
  echo "Installing pnpm..."
  npm install -g pnpm
fi

# 2. Install monorepo deps
echo "Installing dependencies..."
pnpm install --frozen-lockfile || pnpm install

# 3. Copy env files if missing
if [ ! -f apps/api/.env ]; then
  echo "Creating apps/api/.env from example..."
  cp apps/api/.env.example apps/api/.env
fi

# 4. Wait for postgres to be ready, then run migrations
echo "Waiting for Postgres..."
for i in $(seq 1 30); do
  if pg_isready -h localhost -U gustale -d gustale &>/dev/null; then
    echo "Postgres is up!"
    break
  fi
  echo "  waiting... ($i/30)"
  sleep 2
done

# The migration chain.
#
# This called `pnpm --filter @gustale/api run db:migrate`, which is NOT
# a script that exists — apps/api has no `db:migrate` — and its fallback
# message pointed at `pnpm db:migrate`, which did not exist either. So
# the devcontainer has been silently skipping its migrations.
#
# The chain is now `scripts/ci-migration-chain.sh`, which applies the
# base schema and the GUS chain in order and seeds the reference
# dishes. It creates its own database, so it is pointed at the dev
# database by name.
# CHAIN_MODE=ci is REQUIRED here.
#
# The devcontainer's Postgres is a SERVICE on localhost:5432 — there is
# no `shared-postgres` container to `docker exec` into, which is the
# mode the script uses by default. CHAIN_MODE=ci makes it connect over
# TCP as the `gustale` role instead.
echo "Running the migration chain..."
CHAIN_MODE=ci PGPASSWORD=gustale_dev bash scripts/ci-migration-chain.sh gustale_dev \
  || echo "(the chain failed — run it by hand: CHAIN_MODE=ci PGPASSWORD=gustale_dev bash scripts/ci-migration-chain.sh gustale_dev)"

# 5. Create MinIO buckets
echo "Setting up MinIO buckets..."
mc alias set local http://localhost:9000 gustale_dev gustale_dev_password 2>/dev/null || true
mc mb local/gustale-public --ignore-existing 2>/dev/null || true
mc mb local/gustale-media --ignore-existing 2>/dev/null || true
mc anonymous set download local/gustale-public 2>/dev/null || true

# 6. Print dev commands
echo ""
echo "=== Setup complete! ==="
echo ""
echo "Dev services:"
echo "  Web UI   → http://localhost:4321"
echo "  API      → http://localhost:4000"
echo "  MinIO    → http://localhost:9001 (user: gustale_dev / pass: gustale_dev_password)"
echo ""
echo "Start commands:"
echo "  Terminal 1: pnpm --filter @gustale/api dev"
echo "  Terminal 2: pnpm --filter @gustale/web dev"
echo ""
