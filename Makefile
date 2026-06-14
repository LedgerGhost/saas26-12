.PHONY: up down logs build rebuild ps seed reset test ci-build help

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
