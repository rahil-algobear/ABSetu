.PHONY: help install install-dev test test-coverage lint format type-check run run-local run-local-port migrate upgrade downgrade kill-server clean db-reset db-fresh seed seed-org seed-test-entities seed-test-sessions

# Use venv python if available, otherwise fall back to python3
PYTHON := $(shell if [ -f venv/bin/python ]; then echo venv/bin/python; else echo python3; fi)
PORT ?= 8100

help:
	@echo "Available commands:"
	@echo "  make install              - Install production dependencies"
	@echo "  make install-dev          - Install development dependencies"
	@echo "  make test                 - Run tests"
	@echo "  make test-coverage        - Run tests with coverage report"
	@echo "  make lint                 - Run linters"
	@echo "  make format               - Format code with black and isort"
	@echo "  make type-check           - Run type checking with mypy"
	@echo "  make run                  - Run the application"
	@echo "  make run-local            - Run application in local mode with reload (default PORT=8100)"
	@echo "  make run-local-port       - Run application on custom port (use PORT=8001)"
	@echo "  make migrate              - Create a new migration (use msg='Description')"
	@echo "  make upgrade              - Apply database migrations"
	@echo "  make downgrade            - Rollback last migration"
	@echo "  make kill-server          - Kill server running on port 8000"
	@echo "  make db-reset             - Drop and recreate the database (WARNING: destroys all data)"
	@echo "  make db-fresh             - Reset DB + run migrations + seed all (fresh start)"
	@echo "  make seed-test-entities   - Bulk-create test entities (org=KSHAMATA type=Beneficiary count=1000 prefix='Auto-Test Beneficiary')"
	@echo "  make seed-test-sessions   - Bulk-create test sessions (org=KSHAMATA n=30 clear=0)"
	@echo "  make clean                - Clean up cache and temporary files"

install:
	pip install -r requirements.txt

install-dev:
	pip install -r requirements.txt
	pip install -r requirements-dev.txt
	pre-commit install

test:
	pytest

test-coverage:
	pytest --cov=app --cov-report=html

lint:
	flake8 app tests
	black --check app tests
	isort --check-only app tests

format:
	black app tests
	isort app tests

type-check:
	mypy app --ignore-missing-imports

run:
	@echo "Running FastAPI application..."
	@echo "Set APP_ENV=local or APP_ENV=production, or use: make run-local"
	$(PYTHON) -m uvicorn app.main:app --host 0.0.0.0 --port $(PORT)

run-local:
	APP_ENV=local $(PYTHON) -m uvicorn app.main:app --host 0.0.0.0 --port $(PORT) --reload

run-local-port:
	@if [ -z "$(PORT)" ]; then \
		echo "Error: PORT required. Usage: make run-local-port PORT=8001"; \
		exit 1; \
	fi
	APP_ENV=local $(PYTHON) -m uvicorn app.main:app --host 0.0.0.0 --port $(PORT) --reload

migrate:
	@if [ -z "$(msg)" ]; then \
		echo "Error: Migration message required. Usage: make migrate msg='Description'"; \
		exit 1; \
	fi
	alembic revision --autogenerate -m "$(msg)"

upgrade:
	alembic upgrade head

downgrade:
	alembic downgrade -1

seed:
	$(PYTHON) -m app.seeds.initial

seed-org:
	@if [ -z "$(file)" ]; then \
		echo "Error: Seed file required. Usage: make seed-org file=kshamata"; \
		exit 1; \
	fi
	$(PYTHON) -m app.seeds.$(file)

# Bulk-create test entities (defaults: org=KSHAMATA type=Beneficiary count=1000
# prefix="Auto-Test Beneficiary"). Override any with var=value, e.g.:
#   make seed-test-entities count=500
#   make seed-test-entities org=KSHAMATA type=Facilitator count=50 prefix="Load Test"
org ?= KSHAMATA
type ?= Beneficiary
count ?= 1000
prefix ?= Auto-Test Beneficiary
seed-test-entities:
	$(PYTHON) -m app.seeds.test_entities \
		--org "$(org)" \
		--type "$(type)" \
		--count $(count) \
		--prefix "$(prefix)"

# Bulk-create test sessions covering Physical Health (custom participant
# fields), Mental Health / Education / Life Skill Education / Skill Building
# with Sub-Interventions, and an Outreach mix across Institutions /
# Post-Institutions / Community. `n=` overrides count (defaults to 30).
# Use `clear=1` to remove sessions tagged with meta._seed_marker="test-session"
# before inserting a fresh batch.
#   make seed-test-sessions
#   make seed-test-sessions n=50
#   make seed-test-sessions n=100 clear=1
n ?= 30
clear ?= 0
seed-test-sessions:
	$(PYTHON) -m app.seeds.test_sessions \
		--org "$(org)" \
		--count $(n) \
		$(if $(filter-out 0,$(clear)),--clear,)

db-reset:
	@echo "WARNING: This will destroy ALL data in the database!"
	@echo "Dropping and recreating database..."
	$(PYTHON) -c "from app.core.config import settings; \
		url = settings.DATABASE_URL; \
		db_name = url.rsplit('/', 1)[-1].split('?')[0]; \
		base_url = url.rsplit('/', 1)[0]; \
		from sqlalchemy import create_engine, text; \
		eng = create_engine(base_url + '/postgres', isolation_level='AUTOCOMMIT'); \
		conn = eng.connect(); \
		conn.execute(text(f\"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='{db_name}' AND pid <> pg_backend_pid()\")); \
		conn.execute(text(f'DROP DATABASE IF EXISTS {db_name}')); \
		conn.execute(text(f'CREATE DATABASE {db_name}')); \
		conn.close(); \
		print(f'Database {db_name} reset successfully')"

db-fresh: db-reset upgrade seed
	$(PYTHON) -m app.seeds.kshamata
	$(PYTHON) -m app.seeds.gramodaya
	@echo "Fresh database ready with all seeds!"

kill-server:
	@echo "Killing server on port $(PORT)..."
	@if lsof -ti:$(PORT) > /dev/null 2>&1; then \
		lsof -ti:$(PORT) | xargs kill -9; \
		echo "Killed process(es) on port $(PORT)"; \
	else \
		echo "No process found on port $(PORT)"; \
	fi

clean:
	find . -type d -name __pycache__ -exec rm -r {} +
	find . -type f -name "*.pyc" -delete
	find . -type d -name "*.egg-info" -exec rm -r {} +
	rm -rf .pytest_cache
	rm -rf .mypy_cache
	rm -rf htmlcov
	rm -rf .coverage
