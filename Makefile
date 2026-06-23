.PHONY: up down logs build rebuild ps seed seed-analytics seed-billing seed-charts reset test ci-build help

# Default target — show help
help:
	@echo "saasPlug — common shortcuts"
	@echo ""
	@echo "  make up       Start the whole stack (detached)"
	@echo "  make down     Stop everything (keep volumes)"
	@echo "  make reset    Stop and DROP all volumes (loses data)"
	@echo "  make logs     Tail all service logs"
	@echo "  make ps       Show running containers"
	@echo "  make build    Build all images"
	@echo "  make rebuild  Force-rebuild with --no-cache"
	@echo "  make seed     Run scripts/seed.js against the running stack"
	@echo "  make seed-analytics  Fill analytics charts with demo log_entries (30 days)"
	@echo "  make seed-billing    Create real UNPAID invoices to test Stripe payment"
	@echo "  make seed-charts     Run both analytics + billing seeds"
	@echo "  make test     Run unit tests in every service"
	@echo "  make ci-build Validate docker-compose + build all images (used by CI)"

up:
	docker compose up -d --build

down:
	docker compose down

reset:
	docker compose down -v

logs:
	docker compose logs -f --tail=100

ps:
	docker compose ps

build:
	docker compose build

rebuild:
	docker compose build --no-cache

seed:
	@command -v node >/dev/null || { echo "node is required to run the seed script"; exit 1; }
	API_BASE=$${API_BASE:-http://localhost/api} node scripts/seed.js

# Seed analytics log_entries directly into mongo-analyticsdb (runs inside the
# docker network using the analytics-service image, which already has mongoose).
seed-analytics:
	docker compose run --rm --no-deps -v "$(PWD)/scripts:/seed" \
		-e NODE_PATH=/app/service/node_modules \
		-e WIPE=$${WIPE:-0} -e DAYS=$${DAYS:-30} \
		analytics-service node /seed/seed-analytics.js

# Seed real UNPAID invoices into mongo-billingdb so the Stripe pay flow can be tested.
seed-billing:
	docker compose run --rm --no-deps -v "$(PWD)/scripts:/seed" \
		-e NODE_PATH=/app/service/node_modules \
		-e WIPE=$${WIPE:-0} -e PROVIDER=$${PROVIDER:-redPlug} \
		billing-service node /seed/seed-billing.js

seed-charts: seed-analytics seed-billing

test:
	@set -e; \
	for svc in services/*/; do \
		if [ -f $$svc/package.json ] && grep -q '"test"' $$svc/package.json; then \
			echo "→ $$svc"; \
			(cd $$svc && npm test); \
		fi \
	done

ci-build:
	docker compose config --quiet
	docker compose build
