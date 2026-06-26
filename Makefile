# Gustale — Makefile
# Convenience commands for local development.
# Full guide: docs/DEV_SETUP.md

.PHONY: help dev-up dev-down dev-logs db-migrate db-reset typecheck test build

# ── Dev services (Postgres + MinIO) ────────────────────────────────────────────

dev-up: ## Start Postgres + MinIO in Docker
	docker compose -f .devcontainer/docker-compose.yml up -d

dev-down: ## Stop dev services
	docker compose -f .devcontainer/docker-compose.yml down

dev-logs: ## Tail dev service logs
	docker compose -f .devcontainer/docker-compose.yml logs -f

# ── Database ─────────────────────────────────────────────────────────────────

db-migrate: ## Run pending Drizzle migrations
	pnpm --filter @gustale/api run db:migrate

db-reset: ## Drop all tables and re-run migrations (DANGEROUS — destroys local data)
	docker exec gustale-postgres-dev psql -U gustale -d gustale -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" && pnpm --filter @gustale/api run db:migrate

# ── Typecheck ─────────────────────────────────────────────────────────────────

typecheck: ## Typecheck all packages
	pnpm exec tsc --noEmit

# ── Tests ─────────────────────────────────────────────────────────────────────

test: ## Run all tests
	pnpm test

# ── Build ──────────────────────────────────────────────────────────────────────

build: ## Build both apps for production
	pnpm build

# ── Help ──────────────────────────────────────────────────────────────────────

help:
	@grep -E '^[a-zA-Z_-]+:.*##' Makefile | sort | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'
